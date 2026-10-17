<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch, onMounted, onUnmounted } from 'vue'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppRadioGroup from '@/components/ui/AppRadioGroup.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import { ApiError, describeError } from '@/api'
import { refocusAfterCollapse } from '@/utils/refocus'
import { revealRegion } from '@/utils/reveal'
import { secretNameProblem } from '@/utils/validation'
import { renderNamespace, renderPathTemplate, renderedIdentityTail, templateDirectory } from '@/utils/gitPath'
import type { NamespaceGitPaths } from '@/types'

// One form for both ways a Secret is managed — writing it, or adopting a live one; this textarea is the only place holding a whole Secret in plaintext, cleared on discard and unmount, never on submit.
const props = defineProps<{ namespace: string; baseCommit?: string }>()
const emit = defineEmits<{ 'update:name': [value: string] }>()
const auth = useAuthStore()
const store = useSecretsStore()
const mode = ref<'create' | 'adopt'>('create')
const name = ref(''); const yaml = ref(''); const scope = ref('strict'); const targetDir = ref(''); const subdirectory = ref(''); const error = ref(''); const loading = ref(false)
const canCreate = computed(() => auth.hasCapability(props.namespace, 'secret:seal'))
// A sealed draft is a change with no mutations: /secrets/encrypt produced the ciphertext outright, so the review stage never runs.
const draft = computed(() => (store.change?.encrypted ? store.change : null))
// The chip labels are short because a segment is: the full words set the Source pill wider than the 290px track it lives in.
const scopes = [{ label: 'Strict', value: 'strict' }, { label: 'Namespace', value: 'namespace-wide' }, { label: 'Cluster', value: 'cluster-wide' }]
const sources = [{ label: 'Write new', value: 'create' }, { label: 'Adopt running', value: 'adopt' }]
const adopting = computed(() => mode.value === 'adopt')
const kubectlCommand = computed(() => `kubectl get secret <name> -n ${props.namespace} -o yaml`)

// No allowed directories leaves the picker unrendered and the request carrying no target_path, so the server renders its own template.
const currentNsPaths = computed((): NamespaceGitPaths | null => store.namespaceGitPaths(props.namespace))
// An allowed entry may carry `{namespace}`; the server replaces it before matching, so the value offered here must be the replaced one.
const directories = computed(() =>
  (currentNsPaths.value?.allowed_paths || []).map((directory) => renderNamespace(directory, props.namespace)),
)
const pathTemplate = computed(() => currentNsPaths.value?.path_template || '')

// The file a create occupies with no directory chosen; empty until a name is typed, since the server refuses a nameless path.
const defaultDestination = computed(() => renderPathTemplate(pathTemplate.value, props.namespace, name.value))

// The server writes the path it is given, so a blank, doubled or `.` segment is tidied here; what the picker names must be what is sent.
const normalizedSubdirectory = computed(() =>
  subdirectory.value.split('/').map((segment) => segment.trim()).filter((segment) => segment && segment !== '.').join('/'),
)
// `..` is the one segment no tidying can resolve: it would name a path outside the directory just chosen.
const stepsOutside = computed(() => normalizedSubdirectory.value.split('/').includes('..'))

// Submitting the bare directory is `400 INVALID_TARGET_PATH`, so it is joined here with the template's identity-bearing tail.
const destination = computed(() => {
  const tail = renderedIdentityTail(pathTemplate.value, props.namespace, name.value)
  if (!targetDir.value || !tail) return ''
  return [targetDir.value, normalizedSubdirectory.value, tail].filter(Boolean).join('/')
})
// The first option is the mapping's own template, named as the directory it lands in; only it carries the namespace default.
const defaultDirectory = computed(() => templateDirectory(pathTemplate.value, props.namespace))
const pathOptions = computed(() => [
  { label: defaultDirectory.value ? `${defaultDirectory.value}/ (the namespace default)` : 'The namespace default', value: '' },
  ...directories.value.filter((directory) => directory !== `${defaultDirectory.value}/`).map((directory) => ({ label: directory, value: directory })),
])

// The depth field exists only under a chosen directory, so returning to the mapping's own template drops what it held.
watch(targetDir, (next) => { if (!next) subdirectory.value = '' })

// The path is the one thing this choice decides, so the select states it — but only once a name completes it.
const destinationHint = computed(() => {
  if (destination.value) return `the file will be ${destination.value}`
  if (targetDir.value) return 'the file this lands on is named once the Secret has a name.'
  return defaultDestination.value ? `the file will be ${defaultDestination.value}` : `Rendered per Secret from ${pathTemplate.value}`
})

// The one value is empty on purpose: a template that reads like real data is one someone eventually delivers.
function templateFor(secretName: string, namespace: string): string {
  return [
    '# Sealed in this browser. Only the ciphertext is ever stored or sent.',
    'apiVersion: v1',
    'kind: Secret',
    'metadata:',
    `  name: ${nameLine(secretName)}`,
    `  namespace: ${namespace}`,
    'type: Opaque',
    'stringData:',
    '  key: ""',
    '',
  ].join('\n')
}

function nameLine(secretName: string): string {
  // A value YAML would misread — whitespace or a quote — travels double-quoted, so the line reads back exactly what was typed.
  if (/[\s"]/.test(secretName)) return JSON.stringify(secretName)
  return secretName === '' ? '""' : secretName
}

// Scoped to the metadata block and located by line, so a key called `name` under stringData is neither read nor spliced into.
function nameLineIndex(doc: string): number {
  const lines = doc.split('\n')
  let index = lines.indexOf('metadata:')
  if (index === -1) return -1
  for (index += 1; index < lines.length; index++) {
    const line = lines[index]
    if (line.trim() === '') continue
    if (!line.startsWith('  ')) return -1
    if (line.startsWith('  name: ')) return index
  }
  return -1
}

/** What the manifest says the Secret is called, or null when it does not say. */
function nameInManifest(doc: string): string | null {
  const index = nameLineIndex(doc)
  if (index === -1) return null
  const raw = doc.split('\n')[index].slice('  name: '.length)
  // What this editor wrote is quoted when quoting was needed, so it reads back exactly; a plain scalar loses whitespace, hence the trim.
  if (raw.startsWith('"')) {
    try {
      return JSON.parse(raw) as string
    } catch {
      return null
    }
  }
  return raw.trim()
}

// A line no longer holding the name last rendered here was written by hand, so the field is brought to the document instead.
function rewriteTemplateName(doc: string, previous: string, next: string): string | null {
  const index = nameLineIndex(doc)
  if (index === -1) return null
  const lines = doc.split('\n')
  if (lines[index] !== `  name: ${nameLine(previous)}`) return null
  lines[index] = `  name: ${nameLine(next)}`
  return lines.join('\n')
}

// `renderedName` is what lets a re-seed tell "still mine" from "taken over".
const pristineTemplate = computed(() => templateFor(name.value, props.namespace))
const renderedName = ref('')

// A box holding only the template would seal one empty value, so encrypt answers; the message appears only once a field is left or encrypt pressed.
const holdsOnlyTemplate = computed(() => yaml.value === pristineTemplate.value)
const shown = reactive({ name: false, yaml: false, manifest: false, subdirectory: false })

function nameProblem() {
  if (!shown.name) return ''
  const trimmed = name.value.trim()
  if (trimmed === '') return 'This Secret needs a name.'
  return secretNameProblem(trimmed)
}

function subdirectoryProblem() {
  if (!shown.subdirectory) return ''
  return stepsOutside.value ? 'A subdirectory cannot step outside the directory you chose.' : ''
}

// An empty box and an untouched template are the same answer; the template's first line is a comment, so compare against the render.
function manifestProblem() {
  if (!holdsOnlyTemplate.value) return ''
  return shown.manifest ? 'This still holds only the template. Replace the empty key with the entries this Secret needs.' : ''
}

function yamlProblem() {
  if (!shown.yaml) return ''
  if (yaml.value.trim() === '') return 'Paste the manifest, or write one in this box.'
  return manifestProblem()
}

// Leaving a field turns its problem on; each box is its own unit, so only movement inside it does not count.
function leave(field: 'name' | 'yaml' | 'subdirectory', event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (next && (event.currentTarget as HTMLElement).contains(next)) return
  shown[field] = true
  if (field === 'yaml') shown.manifest = true
}

// Encrypting folds this stage; the draft's existence is the stage's whole state, so the fold and the workflow cannot disagree.
const open = computed(() => !draft.value)
// A native button so the ref is the element itself; only `yamlInput` is a component, so only it carries `$el`.
const toggle = ref<HTMLElement | null>(null)
const nameInput = ref<HTMLElement | null>(null)
const yamlInput = ref<{ $el?: HTMLElement } | null>(null)
const subdirectoryInput = ref<HTMLElement | null>(null)
// The draft's own name rather than the field's: the row reports what was sealed, and the field may be retyped underneath.
const summary = computed(() => ({
  name: draft.value?.name || name.value,
  scope: scope.value,
  path: destination.value || defaultDestination.value,
}))

// The page's spine names what is already in this namespace, so the typed name is mirrored up rather than read back out of the form.
watch(name, (value) => emit('update:name', value), { immediate: true })

watch(draft, async (next) => {
  // Whichever control goes with the draft takes focus with it; `null` is a dropped draft, the same target `discard` names.
  await refocusAfterCollapse(() => (next ? toggle.value : nameInput.value))
}, { flush: 'post' })

// A delivered draft is spent: the form clears to a fresh template, while the delivery record (store-driven) stays.
watch(() => store.delivery, (next) => {
  if (!next) return
  name.value = ''; targetDir.value = ''; subdirectory.value = ''
  seedTemplate()
  shown.name = false; shown.yaml = false; shown.manifest = false; shown.subdirectory = false
})

// The draft goes with the box: its ciphertext described what the operator has now changed. Nothing is lost — the plaintext is still in the box.
function edit() { store.discardChange() }
defineExpose({ edit })

// The refusal lands below the press, off the bottom of a long form, so it is carried into view and focused when it appears.
const errorAlert = ref<{ $el?: HTMLElement } | null>(null)
watch(error, (next) => { if (next) revealRegion(() => errorAlert.value?.$el, { focus: true }) })

function seedTemplate() {
  renderedName.value = name.value
  yaml.value = pristineTemplate.value
}

function seedTemplateIfUntouched() {
  if (yaml.value === '' || yaml.value === templateFor(renderedName.value, props.namespace)) seedTemplate()
}

// The Name field and the manifest's own `name` line are one value seen twice, and the last one written holds — the server refuses a
// manifest whose `metadata.name` disagrees. Reading the document rather than the last keystroke lets a hand-written name take over cleanly.
watch(name, (next) => {
  if (next === renderedName.value) return
  const rewritten = rewriteTemplateName(yaml.value, renderedName.value, next)
  renderedName.value = next
  if (rewritten !== null) yaml.value = rewritten
})

watch(yaml, (doc) => {
  const found = nameInManifest(doc)
  if (found === null || found === renderedName.value) return
  renderedName.value = found
  name.value = found
})

// The two sources want different boxes; switching moves between them only over content this component owns.
watch(mode, (next) => {
  if (next === 'create') { seedTemplateIfUntouched(); return }
  if (holdsOnlyTemplate.value) yaml.value = ''
})

onMounted(() => {
  if (mode.value === 'create') seedTemplate()
  // Shared with the create page's spine: only the first to mount asks.
  if (!store.gitPaths) store.fetchGitPaths()
})

// Offering the control and answering the press is what makes the missing piece legible; a greyed control with a sentence beside it answers nothing.
async function encrypt() {
  if (!canCreate.value) return
  shown.name = true; shown.yaml = true; shown.manifest = true; shown.subdirectory = true
  await nextTick()
  // Focus lands on the first field that needs answering: name, then path, then manifest.
  const focus = nameProblem() ? nameInput.value
    : subdirectoryProblem() ? subdirectoryInput.value
    : yamlProblem() ? yamlInput.value?.$el
    : null
  if (focus) { focus.focus(); return }
  await createDraft()
}

async function createDraft() {
  error.value = ''; loading.value = true
  try {
    await store.encryptDraft(props.namespace, name.value, yaml.value, scope.value, props.baseCommit, destination.value || undefined)
    // The manifest box keeps what the operator wrote through the fold, or a reopened stage leaves no way back to the plaintext; the validation marks go.
    shown.name = false; shown.yaml = false; shown.manifest = false; shown.subdirectory = false
  } catch (e) {
    // Both refusals restate which manifest this is in the operator's terms; describeError carries the server's request id either way.
    if (e instanceof ApiError && e.code === 'PATH_OCCUPIED') {
      error.value = `${describeError(e, 'Encryption failed')} Use the existing Secret instead: open it from the namespace list and edit one value there.`
    } else if (e instanceof ApiError && e.code === 'INVALID_MANIFEST') {
      error.value = `${describeError(e, 'Encryption failed')} Check that the name above matches metadata.name in the manifest, that it is a Secret rather than a SealedSecret, and that every key name uses only letters, digits, dashes, underscores, and dots.`
    } else {
      error.value = describeError(e, 'Encryption failed')
    }
  }
  finally { loading.value = false }
}

function discard() {
  store.discardChange()
  name.value = ''; targetDir.value = ''; subdirectory.value = ''
  seedTemplate()
  shown.name = false; shown.yaml = false; shown.manifest = false; shown.subdirectory = false
  // The pressed button goes with the discard, so focus is carried to the field the emptied form starts at.
  return refocusAfterCollapse(() => nameInput.value)
}

// A plaintext manifest must not outlive the page it was pasted on.
onUnmounted(() => { yaml.value = '' })
</script>

<template>
  <div v-if="canCreate" class="flex flex-col gap-4">
    <!-- The folded stage keeps saying what it holds and stays the way back into it; both controls are bare text, since the work of the row is the line. -->
    <div
      v-if="!open"
      class="flex flex-wrap items-center gap-2.5 rounded-control border border-border bg-surface px-3 py-[9px] text-xs text-muted"
    >
      <span class="font-mono font-semibold text-ink">{{ summary.name }}</span>
      <span v-if="summary.scope">· {{ summary.scope }}</span>
      <span v-if="summary.path" class="font-mono font-semibold text-ink">· {{ summary.path }}</span>
      <span class="ml-auto flex flex-wrap items-center gap-3">
        <!-- Clearing is the one destructive control in the flow: what it drops is their only copy of what they wrote. -->
        <button
          v-if="draft"
          type="button"
          class="max-sm:inline-flex max-sm:min-h-11 cursor-pointer font-semibold text-muted hover:text-ink"
          @click="discard"
        >Discard encrypted draft</button>
        <button
          ref="toggle"
          type="button"
          class="max-sm:inline-flex max-sm:min-h-11 cursor-pointer font-semibold text-accent hover:underline underline-offset-4"
          @click="edit"
        >Edit</button>
      </span>
    </div>

    <div v-show="open" class="flex flex-col gap-4">
      <!-- The mockup's `290px 1fr` at 22px, stacking under 932px — the width at which this column still holds both. -->
      <div class="grid grid-cols-1 items-start gap-[22px] min-[932px]:grid-cols-[290px_1fr]">
        <div class="flex min-w-0 flex-col gap-[13px]">
          <div class="flex flex-col gap-[6px]">
            <span class="text-[12px] font-[650] text-ink">Source</span>
            <AppRadioGroup v-model="mode" name="secret-source" :options="sources" ariaLabel="Secret source" variant="segmented" />
          </div>

          <AppAlert v-if="adopting" type="info" title="Adopt a running Secret">
            <p class="m-0 text-[13px] text-muted">
              Read it with <code class="font-mono">{{ kubectlCommand }}</code> and paste the output below.
              The live object's runtime metadata and apply annotations are stripped before sealing, so only
              the Secret's content is versioned. Nothing is read from the cluster by this application.
            </p>
          </AppAlert>

          <label class="flex flex-col gap-[6px]" @focusout="leave('name', $event)">
            <span class="text-[12px] font-[650] text-ink">Name</span>
            <input
              ref="nameInput"
              v-model="name"
              type="text"
              aria-label="New secret name"
              :aria-invalid="nameProblem() ? 'true' : undefined"
              :aria-describedby="nameProblem() ? 'name-problem' : undefined"
              :placeholder="adopting ? 'Name, exactly as metadata.name' : 'Secret name'"
              autocomplete="off"
              spellcheck="false"
              class="h-8 w-full rounded-[8px] border border-border-strong bg-bg px-2.5 font-mono text-[13px] max-sm:text-[14px] text-ink placeholder:font-sans placeholder:text-faint focus-visible:border-accent focus-visible:outline-none"
            />
            <!-- The file the name produces, not a summary of one; a path is one unbroken token, so it breaks rather than widening the column. -->
            <span class="font-mono text-[11px] text-faint break-all">{{ destination || defaultDestination || pathTemplate || 'the namespace default' }}</span>
            <span v-if="nameProblem()" id="name-problem" class="text-[12.5px] text-danger">{{ nameProblem() }}</span>
          </label>

          <div class="flex flex-col gap-[6px]">
            <span class="text-[12px] font-[650] text-ink">Scope</span>
            <AppRadioGroup v-model="scope" name="secret-scope" :options="scopes" ariaLabel="Secret scope" variant="segmented" />
          </div>

          <AppSelect
            v-if="currentNsPaths && directories.length > 0"
            v-model="targetDir"
            label="Target directory"
            :options="pathOptions"
            :hint="destinationHint"
          />

          <!-- Only under a chosen directory: a depth beneath that choice, which the mapping's own template does not have. -->
          <label v-if="targetDir" class="flex flex-col gap-[6px]" @focusout="leave('subdirectory', $event)">
            <span class="text-[12px] font-[650] text-ink">Further subdirectory</span>
            <input
              ref="subdirectoryInput"
              v-model="subdirectory"
              type="text"
              aria-label="Further subdirectory under the chosen directory"
              :aria-invalid="subdirectoryProblem() ? 'true' : undefined"
              :aria-describedby="subdirectoryProblem() ? 'subdirectory-problem' : undefined"
              placeholder="e.g. prod"
              autocomplete="off"
              spellcheck="false"
              class="h-8 w-full rounded-[8px] border border-border-strong bg-bg px-2.5 font-mono text-[13px] max-sm:text-[14px] text-ink placeholder:font-sans placeholder:text-faint focus-visible:border-accent focus-visible:outline-none"
            />
            <span v-if="subdirectoryProblem()" id="subdirectory-problem" class="text-[12.5px] text-danger">{{ subdirectoryProblem() }}</span>
          </label>
        </div>

        <label class="flex min-w-0 flex-col gap-[6px]" @focusout="leave('yaml', $event)">
          <span class="text-[12px] font-[650] text-ink">Secret manifest</span>
          <AppTextarea
            ref="yamlInput"
            v-model="yaml"
            ariaLabel="New secret YAML"
            :placeholder="adopting ? 'Output of the kubectl command above' : 'Complete Kubernetes Secret YAML'"
            :rows="10"
            :invalid="!!yamlProblem()"
            :describedBy="yamlProblem() ? 'yaml-problem' : undefined"
          />
          <span v-if="yamlProblem()" id="yaml-problem" class="text-[12.5px] text-danger">{{ yamlProblem() }}</span>
        </label>
      </div>

      <!-- The one press the stage has, at the same right edge the bar below uses, so the primary control does not change sides. -->
      <div class="flex items-center justify-end gap-3 border-t border-border pt-3.5">
        <AppButton variant="primary" icon="lock" :loading="loading" @click="encrypt">Encrypt for review</AppButton>
      </div>

      <AppAlert v-if="error" ref="errorAlert" type="error" title="Unable to encrypt">
        <p class="m-0 max-w-[62ch] text-[13px] text-muted">{{ error }}</p>
      </AppAlert>
    </div>
  </div>
</template>
