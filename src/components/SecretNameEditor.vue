<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch, onMounted, onUnmounted } from 'vue'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppRadioGroup from '@/components/ui/AppRadioGroup.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import { ApiError, describeError } from '@/api'
import { refocusAfterCollapse } from '@/utils/refocus'
import { renderNamespace, renderPathTemplate, renderedFileName } from '@/utils/gitPath'
import type { NamespaceGitPaths } from '@/types'

// One form for both ways a Secret gets managed: writing it here, and adopting a live one
// (`kubectl get secret -o yaml` emits exactly the manifest the server seals). This
// textarea is the only place in the app holding a whole Secret in plaintext — never the
// store — and it is cleared on discard and unmount, not on submit: a folded stage that
// reopened empty would leave the operator no way back to what they typed.
const props = defineProps<{ namespace: string; baseCommit?: string }>()
const auth = useAuthStore()
const store = useSecretsStore()
const mode = ref<'create' | 'adopt'>('create')
const name = ref(''); const yaml = ref(''); const scope = ref('strict'); const targetDir = ref(''); const error = ref(''); const loading = ref(false)
const canCreate = computed(() => auth.hasCapability(props.namespace, 'secret:seal'))
// A sealed draft is a change with no mutations: /secrets/encrypt produced its ciphertext
// outright, so there is nothing to diff it against and the review stage never runs.
const draft = computed(() => (store.change?.encrypted ? store.change : null))
const scopes = [{ label: 'Strict', value: 'strict' }, { label: 'Namespace-wide', value: 'namespace-wide' }, { label: 'Cluster-wide', value: 'cluster-wide' }]
const sources = [{ label: 'Write a new Secret', value: 'create' }, { label: 'Adopt an existing Secret', value: 'adopt' }]
const adopting = computed(() => mode.value === 'adopt')
const kubectlCommand = computed(() => `kubectl get secret <name> -n ${props.namespace} -o yaml`)

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

// The select picks a directory, but the server writes the path it is given: submitting the bare
// directory is `400 INVALID_TARGET_PATH`, since an allowed entry is a prefix the destination must
// sit under. So the chosen directory is joined with the file name here, where the name is known.
const destination = computed(() => {
  const fileName = renderedFileName(defaultDestination.value)
  return targetDir.value && fileName ? `${targetDir.value}/${fileName}` : ''
})
const pathOptions = computed(() => [
  { label: 'Use default path', value: '' },
  ...directories.value.map((directory) => ({ label: directory, value: directory })),
])

// The one value is empty on purpose: a template that reads like real data is one someone
// eventually delivers.
function templateFor(secretName: string, namespace: string): string {
  return [
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
const shown = reactive({ name: false, yaml: false })

function nameProblem() {
  if (!shown.name) return ''
  return name.value.trim() === '' ? 'This Secret needs a name.' : ''
}

// An empty box and an untouched template are the same answer: nothing to seal either way.
function yamlProblem() {
  if (!shown.yaml) return ''
  if (yaml.value.trim() === '') return 'Paste the manifest, or write one in this box.'
  if (holdsOnlyTemplate.value) return 'This still holds only the template. Replace the empty key with the entries this Secret needs.'
  return ''
}

// Leaving a field is what turns its problem on. Each box is its own unit here, so moving
// to the next one counts as leaving — only movement inside the box does not.
function leave(field: 'name' | 'yaml', event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (next && (event.currentTarget as HTMLElement).contains(next)) return
  shown[field] = true
}

// Encrypting is what moves the flow on, so that is what folds this stage: the form keeps its
// contents behind the toggle and the review below becomes what the page is about.
const override = ref<boolean | null>(null)
const open = computed(() => override.value ?? !draft.value)
const toggle = ref<{ $el?: HTMLElement } | null>(null)
const nameInput = ref<{ $el?: HTMLElement } | null>(null)
const yamlInput = ref<{ $el?: HTMLElement } | null>(null)
const summary = computed(() => [
  draft.value ? `Encrypted draft for ${draft.value.name}` : name.value,
  scope.value,
  destination.value || defaultDestination.value,
].filter(Boolean).join(' · '))

watch(draft, async () => {
  override.value = null
  // The control that folded the stage goes with it, so focus has to be carried to the toggle
  // rather than left on `<body>`.
  await refocusAfterCollapse(() => toggle.value?.$el)
}, { flush: 'post' })

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
  // Shared with the create page's rail: only the first to mount asks.
  if (!store.gitPaths) store.fetchGitPaths()
})

// Offering the control and answering the press is what makes the missing piece legible: a
// control greyed out with the reason in a sentence beside it answers nothing.
async function encrypt() {
  if (!canCreate.value) return
  shown.name = true; shown.yaml = true
  await nextTick()
  if (nameProblem() || yamlProblem()) {
    ;(nameProblem() ? nameInput.value?.$el : yamlInput.value?.$el)?.focus()
    return
  }
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
    shown.name = false; shown.yaml = false
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
  name.value = ''; targetDir.value = ''
  seedTemplate()
  shown.name = false; shown.yaml = false
  // Discarding takes the button that was pressed with it, so focus is carried to the field
  // the emptied form starts at rather than dropped on `<body>`.
  return refocusAfterCollapse(() => nameInput.value?.$el)
}

// A plaintext manifest must not outlive the page it was pasted on.
onUnmounted(() => { yaml.value = '' })
</script>

<template>
  <AppCard v-if="canCreate" title="Create new SealedSecret" icon="plus">
    <!-- The folded stage keeps saying what it holds, and stays the way back into it: a draft
         never sits in a state the page offers no way out of. -->
    <div v-if="!open || draft" class="mb-3 flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <span v-if="!open" class="text-sm text-muted">{{ summary }}</span>
        <span class="ml-auto flex flex-wrap items-center gap-2">
          <AppButton v-if="draft" size="small" @click="discard">Discard encrypted draft</AppButton>
          <AppButton v-if="!open" ref="toggle" size="small" variant="ghost" @click="override = true">Edit</AppButton>
          <AppButton v-else size="small" variant="ghost" @click="override = false">Hide</AppButton>
        </span>
      </div>

      <AppAlert v-if="draft" type="success" title="Encrypted draft ready">
        Ciphertext for {{ draft.name }} is queued in the shared review and delivery panel below. The plaintext Secret is no longer held on this page.
      </AppAlert>
    </div>

    <div v-show="open" class="flex flex-col gap-3">
      <AppRadioGroup
        v-model="mode"
        name="secret-source"
        :options="sources"
        label="Secret source"
      />

      <AppAlert v-if="adopting" type="info" title="Adopt an existing Secret">
        Read it with <code class="font-mono">{{ kubectlCommand }}</code> and paste the output below.
        The live object's runtime metadata and apply annotations are stripped before sealing, so only
        the Secret's content is versioned. Nothing is read from the cluster by this application.
      </AppAlert>

      <label class="flex flex-col gap-1 text-sm font-medium text-ink" @focusout="leave('name', $event)">
        <span>Secret name</span>
        <AppInput
          ref="nameInput"
          v-model="name"
          ariaLabel="New secret name"
          :placeholder="adopting ? 'Name, exactly as metadata.name' : 'Secret name'"
          :invalid="!!nameProblem()"
          :describedBy="nameProblem() ? 'name-problem' : ''"
        />
        <span v-if="nameProblem()" id="name-problem" class="text-xs font-normal text-danger">{{ nameProblem() }}</span>
      </label>

      <AppRadioGroup
        v-model="scope"
        name="secret-scope"
        :options="scopes"
        label="Secret scope"
      />

      <AppSelect
        v-if="currentNsPaths && directories.length > 0"
        v-model="targetDir"
        label="Target directory"
        :hint="defaultDestination ? `Default: ${defaultDestination}` : `Rendered per Secret from ${pathTemplate}`"
        :options="pathOptions"
      />

      <label class="flex flex-col gap-1 text-sm font-medium text-ink" @focusout="leave('yaml', $event)">
        <span>Secret manifest</span>
        <AppTextarea
          ref="yamlInput"
          v-model="yaml"
          ariaLabel="New secret YAML"
          :placeholder="adopting ? 'Output of the kubectl command above' : 'Complete Kubernetes Secret YAML'"
          :rows="6"
          :invalid="!!yamlProblem()"
          :describedBy="yamlProblem() ? 'yaml-problem' : ''"
        />
        <span v-if="yamlProblem()" id="yaml-problem" class="text-xs font-normal text-danger">{{ yamlProblem() }}</span>
      </label>

      <div>
        <AppButton
          variant="primary"
          icon="lock"
          :loading="loading"
          @click="encrypt"
        >
          Encrypt for review
        </AppButton>
      </div>

      <AppAlert v-if="error" type="error" title="Unable to encrypt">{{ error }}</AppAlert>
    </div>
  </AppCard>
</template>
