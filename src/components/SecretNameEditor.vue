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
import { renderNamespace, renderPathTemplate, renderedIdentityTail, templateDirectory } from '@/utils/gitPath'
import type { NamespaceGitPaths } from '@/types'

// One form for both ways a Secret gets managed: writing it here, and adopting a live one
// (`kubectl get secret -o yaml` emits exactly the manifest the server seals). This
// textarea is the only place in the app holding a whole Secret in plaintext — never the
// store — and it is cleared on discard and unmount, not on submit: a folded stage that
// reopened empty would leave the operator no way back to what they typed.
const props = defineProps<{ namespace: string; baseCommit?: string }>()
const emit = defineEmits<{ 'update:name': [value: string] }>()
const auth = useAuthStore()
const store = useSecretsStore()
const mode = ref<'create' | 'adopt'>('create')
const name = ref(''); const yaml = ref(''); const scope = ref('strict'); const targetDir = ref(''); const subdirectory = ref(''); const error = ref(''); const loading = ref(false)
const canCreate = computed(() => auth.hasCapability(props.namespace, 'secret:seal'))
// A sealed draft is a change with no mutations: /secrets/encrypt produced its ciphertext
// outright, so there is nothing to diff it against and the review stage never runs.
const draft = computed(() => (store.change?.encrypted ? store.change : null))
const scopes = [{ label: 'Strict', value: 'strict' }, { label: 'Namespace-wide', value: 'namespace-wide' }, { label: 'Cluster-wide', value: 'cluster-wide' }]
const sources = [{ label: 'Write a new Secret', value: 'create' }, { label: 'Adopt a running Secret', value: 'adopt' }]
const adopting = computed(() => mode.value === 'adopt')
const kubectlCommand = computed(() => `kubectl get secret <name> -n ${props.namespace} -o yaml`)

// The scope caption is the option's cost, not a repetition of its name: the three choices are
// not three words, they are three different ties between this ciphertext and this Secret.
const SCOPE_COSTS: Record<string, string> = {
  strict: 'Strict ties the ciphertext to this name and this namespace, so a renamed or moved copy stops decrypting.',
  'namespace-wide': 'Namespace-wide lets the ciphertext be copied to any name in this namespace, at the cost of the tie to this one.',
  'cluster-wide': 'Cluster-wide lets the ciphertext be copied to any name in any namespace, and is the loosest tie the product offers.',
}
const scopeCost = computed(() => SCOPE_COSTS[scope.value] || '')

// A mapping with no allowed directories leaves the picker unrendered and the request carrying no
// target_path, which is what leaves the server rendering its own path template.
const currentNsPaths = computed((): NamespaceGitPaths | null => store.namespaceGitPaths(props.namespace))
// An allowed entry is a directory, and may carry `{namespace}`: the server replaces it before
// matching, so the value offered here has to be the replaced one or nothing could match it.
const directories = computed(() =>
  (currentNsPaths.value?.allowed_paths || []).map((directory) => renderNamespace(directory, props.namespace)),
)
const pathTemplate = computed(() => currentNsPaths.value?.path_template || '')

// The file a create occupies when no directory is chosen. Empty until a name is typed, because
// the template renders one and the server refuses a nameless path.
const defaultDestination = computed(() => renderPathTemplate(pathTemplate.value, props.namespace, name.value))

// Typed freely under a chosen directory, so what it holds is tidied here: the server writes the
// path it is given, so what the picker names has to be what is sent. A blank, doubled or `.`
// segment is the operator's spelling, not a destination.
const normalizedSubdirectory = computed(() =>
  subdirectory.value.split('/').map((segment) => segment.trim()).filter((segment) => segment && segment !== '.').join('/'),
)
// `..` is the one segment no tidying can resolve: honouring it would name a path outside the
// directory just chosen, which is the only thing that choice decides.
const stepsOutside = computed(() => normalizedSubdirectory.value.split('/').includes('..'))

// The select picks a directory, but the server writes the path it is given: submitting the bare
// directory is `400 INVALID_TARGET_PATH`, since an allowed entry is a prefix the destination must
// sit under. So the chosen directory is joined, here, with the template's identity-bearing tail —
// the file name alone would drop the identity of a template like `apps/{name}/cred.yml`.
const destination = computed(() => {
  const tail = renderedIdentityTail(pathTemplate.value, props.namespace, name.value)
  if (!targetDir.value || !tail) return ''
  return [targetDir.value, normalizedSubdirectory.value, tail].filter(Boolean).join('/')
})
// The first option is the mapping's own template, named as the directory it lands in: it is a
// different thing from any allowed directory, since only it carries the namespace default.
const defaultDirectory = computed(() => templateDirectory(pathTemplate.value, props.namespace))
const pathOptions = computed(() => [
  { label: defaultDirectory.value ? `${defaultDirectory.value}/ — the namespace default` : 'The namespace default', value: '' },
  ...directories.value.filter((directory) => directory !== `${defaultDirectory.value}/`).map((directory) => ({ label: directory, value: directory })),
])

// The depth field exists only under a chosen directory, so returning to the mapping's own template
// drops what it held rather than keeping a depth nothing is measured from.
watch(targetDir, (next) => { if (!next) subdirectory.value = '' })

// The path is the one thing this choice decides, so the select states it. Until the name that
// completes it is typed there is no file to name, and the template is not it.
const destinationHint = computed(() => {
  if (destination.value) return `the file will be ${destination.value}`
  if (targetDir.value) return 'the file this lands on is named once the Secret has a name.'
  return defaultDestination.value ? `the file will be ${defaultDestination.value}` : `Rendered per Secret from ${pathTemplate.value}`
})

// The one value is empty on purpose: a template that reads like real data is one someone
// eventually delivers.
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
  return secretName === '' ? '""' : secretName
}

// The name line is found after `metadata:`, so a key called `name` in stringData is never
// the line that moves. A document that no longer reads as the value last rendered here
// has been edited by hand and is left alone.
function rewriteTemplateName(doc: string, previous: string, next: string): string | null {
  const anchor = doc.indexOf('\nmetadata:')
  if (anchor === -1) return null
  const from = `  name: ${nameLine(previous)}`
  const at = doc.indexOf(from, anchor)
  if (at === -1) return null
  return `${doc.slice(0, at)}  name: ${nameLine(next)}${doc.slice(at + from.length)}`
}

// `renderedName` is what lets a re-seed tell "still mine" from "taken over".
const pristineTemplate = computed(() => templateFor(name.value, props.namespace))
const renderedName = ref('')

// A box holding only the template would seal one empty value, so pressing encrypt has to
// answer rather than send. What is missing is said by the field it belongs to, and only
// once that field has been left or encrypt has been pressed — a message that arrives
// before anything has been touched reads as a fault rather than a prompt.
const holdsOnlyTemplate = computed(() => yaml.value === pristineTemplate.value)
const shown = reactive({ name: false, yaml: false, manifest: false, subdirectory: false })

function nameProblem() {
  if (!shown.name) return ''
  return name.value.trim() === '' ? 'This Secret needs a name.' : ''
}

function subdirectoryProblem() {
  if (!shown.subdirectory) return ''
  return stepsOutside.value ? 'A subdirectory cannot step outside the directory you chose.' : ''
}

// An empty box and an untouched template are the same answer: nothing to seal either way.
// The template's own first line is a comment, so the check is against the rendered template
// rather than against emptiness.
function manifestProblem() {
  if (!holdsOnlyTemplate.value) return ''
  return shown.manifest ? 'This still holds only the template. Replace the empty key with the entries this Secret needs.' : ''
}

function yamlProblem() {
  if (!shown.yaml) return ''
  if (yaml.value.trim() === '') return 'Paste the manifest, or write one in this box.'
  return manifestProblem()
}

// Leaving a field is what turns its problem on. Each box is its own unit here, so moving
// to the next one counts as leaving — only movement inside the box does not.
function leave(field: 'name' | 'yaml' | 'subdirectory', event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (next && (event.currentTarget as HTMLElement).contains(next)) return
  shown[field] = true
  if (field === 'yaml') shown.manifest = true
}

// Encrypting is what moves the flow on, so that is what folds this stage: the form keeps its
// contents behind the toggle and the review below becomes what the page is about.
const override = ref<boolean | null>(null)
const open = computed(() => override.value ?? !draft.value)
const toggle = ref<{ $el?: HTMLElement } | null>(null)
const nameInput = ref<{ $el?: HTMLElement } | null>(null)
const yamlInput = ref<{ $el?: HTMLElement } | null>(null)
const subdirectoryInput = ref<{ $el?: HTMLElement } | null>(null)
const summary = computed(() => [
  draft.value ? `Encrypted draft for ${draft.value.name}` : name.value,
  scope.value,
  destination.value || defaultDestination.value,
].filter(Boolean).join(' · '))

// The page's spine names what is already in this namespace, so the typed name is mirrored up
// rather than read back out of the form.
watch(name, (value) => emit('update:name', value), { immediate: true })

watch(draft, async () => {
  override.value = null
  // The control that folded the stage goes with it, so focus has to be carried to the toggle
  // rather than left on `<body>`.
  await refocusAfterCollapse(() => toggle.value?.$el)
}, { flush: 'post' })

// A delivered draft has been sealed and committed, so the plaintext it was built from is spent:
// the form clears to a fresh template rather than reopening on a Secret that is now in Git. The
// delivery record below is driven by the store, not this form, so it stays.
watch(() => store.delivery, (next) => {
  if (!next) return
  name.value = ''; targetDir.value = ''; subdirectory.value = ''
  seedTemplate()
  shown.name = false; shown.yaml = false; shown.manifest = false; shown.subdirectory = false
})

// Reopening from outside: the progress rail's "Compose" stop steps back to this form the same way
// the fold's own Edit button does, keeping the encrypted draft rather than discarding it.
function reopen() { override.value = true }
defineExpose({ reopen })

// The encryption refusal lands below the manifest and the press, which is off the bottom of a long
// form. It is carried into view and given focus when it appears, so the operator is not left on a
// button that looks like it did nothing.
const errorAlert = ref<{ $el?: HTMLElement } | null>(null)
watch(error, (next) => { if (next) revealRegion(() => errorAlert.value?.$el, { focus: true }) })

function seedTemplate() {
  renderedName.value = name.value
  yaml.value = pristineTemplate.value
}

function seedTemplateIfUntouched() {
  if (yaml.value === '' || yaml.value === templateFor(renderedName.value, props.namespace)) seedTemplate()
}

// A document the operator wrote or pasted is never rewritten by a keystroke here.
watch(name, (next) => {
  const rewritten = rewriteTemplateName(yaml.value, renderedName.value, next)
  renderedName.value = next
  if (rewritten !== null) yaml.value = rewritten
})

// The two sources want different boxes — a template to fill in, or an empty one to paste
// into — but switching moves between them only over content this component owns.
watch(mode, (next) => {
  if (next === 'create') { seedTemplateIfUntouched(); return }
  if (holdsOnlyTemplate.value) yaml.value = ''
})

onMounted(() => {
  if (mode.value === 'create') seedTemplate()
  // Shared with the create page's spine: only the first to mount asks.
  if (!store.gitPaths) store.fetchGitPaths()
})

// Offering the control and answering the press is what makes the missing piece legible: a
// control greyed out with the reason in a sentence beside it answers nothing.
async function encrypt() {
  if (!canCreate.value) return
  shown.name = true; shown.yaml = true; shown.manifest = true; shown.subdirectory = true
  await nextTick()
  // The first field that needs answering is the one focus lands on, so the name is asked before
  // the path it lands in and the path before the manifest that goes in it.
  const focus = nameProblem() ? nameInput : subdirectoryProblem() ? subdirectoryInput : yamlProblem() ? yamlInput : null
  if (focus) { focus.value?.$el?.focus(); return }
  await createDraft()
}

async function createDraft() {
  error.value = ''; loading.value = true
  try {
    await store.encryptDraft(props.namespace, name.value, yaml.value, scope.value, props.baseCommit, destination.value || undefined)
    // The manifest box keeps what the operator wrote, including through the fold: the draft holds
    // ciphertext, so a reopened stage showing a fresh template leaves them no way back to the
    // plaintext they typed. Discard is what starts the next Secret from a clean template.
    // The validation marks go, though — the press they answered has been acted on.
    shown.name = false; shown.yaml = false; shown.manifest = false; shown.subdirectory = false
  } catch (e) {
    // Both refusals are about which manifest this is, so they are restated in the
    // operator's terms; describeError carries the server's request id either way.
    if (e instanceof ApiError && e.code === 'PATH_OCCUPIED') {
      error.value = `${describeError(e, 'Encryption failed')} Use the existing Secret instead: open it from the namespace list and edit one value there.`
    } else if (e instanceof ApiError && e.code === 'INVALID_MANIFEST') {
      error.value = `${describeError(e, 'Encryption failed')} Check that the name above matches metadata.name in the manifest, and that it is a Secret rather than a SealedSecret.`
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
  // Discarding takes the button that was pressed with it, so focus is carried to the field
  // the emptied form starts at rather than dropped on `<body>`.
  return refocusAfterCollapse(() => nameInput.value?.$el)
}

// A plaintext manifest must not outlive the page it was pasted on.
onUnmounted(() => { yaml.value = '' })
</script>

<template>
  <div v-if="canCreate" class="flex max-w-[640px] flex-col gap-5">
    <!-- The folded stage keeps saying what it holds, and stays the way back into it: a draft
         never sits in a state the page offers no way out of. -->
    <div v-if="!open" class="flex flex-wrap items-center gap-2">
      <span class="font-mono text-xs text-muted">{{ summary }}</span>
      <span class="ml-auto flex flex-wrap items-center gap-2">
        <AppButton v-if="draft" size="small" @click="discard">Discard encrypted draft</AppButton>
        <AppButton ref="toggle" size="small" variant="ghost" @click="override = true">Edit</AppButton>
      </span>
    </div>

    <div v-show="open" class="flex flex-col gap-5">
      <!-- Settings beside the manifest, not stacked above it: the fields are short and the manifest
           is the only thing here that wants height, so one column put Encrypt ~1,100px down a row
           that was half empty. The breakpoint is 1000px and not the width at which two tracks first
           fit, because this form does not own the width it is drawn at — it is `flex-1` beside a
           258px aside and capped at 640px of its own, so a narrower viewport leaves it ~600px wide
           and a 290px track would squeeze the manifest narrower than the lines in it. -->
      <div class="grid grid-cols-1 items-start gap-x-[22px] gap-y-5 min-[1000px]:grid-cols-[290px_1fr]">
        <div class="flex min-w-0 flex-col gap-[13px]">
          <div class="flex flex-col gap-[7px]">
            <span class="text-[13px] font-semibold text-ink">Where it comes from</span>
            <AppRadioGroup v-model="mode" name="secret-source" :options="sources" ariaLabel="Secret source" />
          </div>

          <AppAlert v-if="adopting" type="info" title="Adopt a running Secret">
            <p class="m-0 text-[13px] text-muted">
              Read it with <code class="font-mono">{{ kubectlCommand }}</code> and paste the output below.
              The live object's runtime metadata and apply annotations are stripped before sealing, so only
              the Secret's content is versioned. Nothing is read from the cluster by this application.
            </p>
          </AppAlert>

          <label class="flex flex-col gap-[7px]" @focusout="leave('name', $event)">
            <span class="text-[13px] font-semibold text-ink">Name</span>
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
              class="h-8 w-full rounded-[8px] border border-border-strong bg-bg px-2.5 font-mono text-[13px] text-ink placeholder:font-sans placeholder:text-faint focus-visible:border-accent focus-visible:outline-none"
            />
            <!-- The file the name produces, before the file exists. It is the path the row will carry,
                 not a summary of one — so a chosen directory moves it, rather than standing beside a
                 default the Secret no longer lands on. A path is one unbroken token, so it breaks
                 rather than widening the column it sits in. -->
            <span class="font-mono text-[11.5px] text-faint break-all">{{ destination || defaultDestination || pathTemplate || 'the namespace default' }}</span>
            <span v-if="nameProblem()" id="name-problem" class="text-[12.5px] text-danger">{{ nameProblem() }}</span>
          </label>

          <div class="flex flex-col gap-[7px]">
            <span class="text-[13px] font-semibold text-ink">Scope</span>
            <AppRadioGroup v-model="scope" name="secret-scope" :options="scopes" ariaLabel="Secret scope" />
            <!-- The consequence is the label, so the choice can be made here rather than looked up. -->
            <span class="text-[11.5px] text-faint">{{ scopeCost }}</span>
          </div>

          <AppSelect
            v-if="currentNsPaths && directories.length > 0"
            v-model="targetDir"
            label="Target directory"
            :options="pathOptions"
            :hint="destinationHint"
          />

          <!-- Only under a chosen directory: a depth beneath that choice, which the mapping's own
               template does not have. Empty is a depth of none, so the file lands where the path shown
               above says it does. -->
          <label v-if="targetDir" class="flex flex-col gap-[7px]" @focusout="leave('subdirectory', $event)">
            <span class="text-[13px] font-semibold text-ink">Further subdirectory</span>
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
              class="h-8 w-full rounded-[8px] border border-border-strong bg-bg px-2.5 font-mono text-[13px] text-ink placeholder:font-sans placeholder:text-faint focus-visible:border-accent focus-visible:outline-none"
            />
            <span v-if="subdirectoryProblem()" id="subdirectory-problem" class="text-[12.5px] text-danger">{{ subdirectoryProblem() }}</span>
          </label>
        </div>

        <label class="flex min-w-0 flex-col gap-[7px]" @focusout="leave('yaml', $event)">
          <span class="text-[13px] font-semibold text-ink">Secret manifest</span>
          <AppTextarea
            ref="yamlInput"
            v-model="yaml"
            ariaLabel="New secret YAML"
            :placeholder="adopting ? 'Output of the kubectl command above' : 'Complete Kubernetes Secret YAML'"
            :rows="10"
            :invalid="!!yamlProblem()"
            :describedBy="yamlProblem() ? 'yaml-problem' : undefined"
            class="w-full resize-y rounded-[10px] border border-border-strong bg-bg px-3.5 py-3 font-mono text-[12.5px] leading-[1.85] text-ink placeholder:font-sans placeholder:text-faint focus-visible:border-accent focus-visible:outline-none"
          />
          <span class="text-[11.5px] text-faint">
            This box is the only place in the app holding a Secret in plaintext. It is cleared when you leave the page, and the encryption happens here, not on the server.
          </span>
          <span v-if="yamlProblem()" id="yaml-problem" class="text-[12.5px] text-danger">{{ yamlProblem() }}</span>
        </label>
      </div>

      <div class="flex items-center justify-between gap-3 border-t border-border pt-3.5">
        <AppButton variant="primary" icon="lock" :loading="loading" @click="encrypt">Encrypt for review</AppButton>
      </div>

      <AppAlert v-if="error" ref="errorAlert" type="error" title="Unable to encrypt">
        <p class="m-0 max-w-[62ch] text-[13px] text-muted">{{ error }}</p>
      </AppAlert>
    </div>
  </div>
</template>
