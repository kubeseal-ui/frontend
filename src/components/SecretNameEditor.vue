<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
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
import type { NamespaceGitPaths } from '@/types'

// One form for both ways a Secret gets managed: writing it here, and adopting a live one
// (`kubectl get secret -o yaml` emits exactly the manifest the server seals). This
// textarea is the only place in the app holding a whole Secret in plaintext — never the
// store — and it is cleared on submit, discard, and unmount.
const props = defineProps<{ namespace: string; baseCommit?: string }>()
const auth = useAuthStore()
const store = useSecretsStore()
const mode = ref<'create' | 'adopt'>('create')
const name = ref(''); const yaml = ref(''); const scope = ref('strict'); const targetPath = ref(''); const error = ref(''); const loading = ref(false)
const canCreate = computed(() => auth.hasCapability(props.namespace, 'secret:seal'))
const scopes = [{ label: 'Strict', value: 'strict' }, { label: 'Namespace-wide', value: 'namespace-wide' }, { label: 'Cluster-wide', value: 'cluster-wide' }]
const sources = [{ label: 'Write a new Secret', value: 'create' }, { label: 'Adopt an existing Secret', value: 'adopt' }]
const adopting = computed(() => mode.value === 'adopt')
const kubectlCommand = computed(() => `kubectl get secret <name> -n ${props.namespace} -o yaml`)

// A wildcard names no paths, so the picker stays unrendered and no target_path is
// submitted — the server renders the template path, which the listing does not carry.
const currentNsPaths = computed((): NamespaceGitPaths | null => store.namespaceGitPaths(props.namespace))
const allowedPaths = computed(() => currentNsPaths.value?.allowed_paths || [])
const defaultPath = computed(() => currentNsPaths.value?.default_path || '')
const pathOptions = computed(() => [{ label: 'Use default path', value: '' }, ...allowedPaths.value.map(p => ({ label: p, value: p }))])

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

// A box holding only the template would seal one empty value, so the control is withheld
// rather than merely unwise.
const holdsOnlyTemplate = computed(() => yaml.value === pristineTemplate.value)

// Encrypting is what moves the flow on, so that is what folds this stage: the form keeps its
// contents behind the toggle and the review below becomes what the page is about.
const override = ref<boolean | null>(null)
const open = computed(() => override.value ?? !store.newSecretDraft)
const toggle = ref<{ $el?: HTMLElement } | null>(null)
const nameInput = ref<{ $el?: HTMLElement } | null>(null)
const summary = computed(() => [
  store.newSecretDraft ? `Encrypted draft for ${store.newSecretDraft.name}` : name.value,
  scope.value,
  targetPath.value || defaultPath.value,
].filter(Boolean).join(' · '))

watch(() => store.newSecretDraft, async () => {
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

async function createDraft() {
  if (!canCreate.value || !name.value || !yaml.value || holdsOnlyTemplate.value) return
  error.value = ''; loading.value = true
  try {
    await store.createNewSecretDraft(props.namespace, name.value, yaml.value, scope.value, props.baseCommit, targetPath.value || undefined)
    seedTemplate()
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
  store.discardNewSecretDraft()
  name.value = ''; targetPath.value = ''
  seedTemplate()
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
    <div v-if="!open || store.newSecretDraft" class="mb-3 flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2">
        <span v-if="!open" class="text-sm text-muted">{{ summary }}</span>
        <span class="ml-auto flex flex-wrap items-center gap-2">
          <AppButton v-if="store.newSecretDraft" size="small" @click="discard">Discard encrypted draft</AppButton>
          <AppButton v-if="!open" ref="toggle" size="small" variant="ghost" @click="override = true">Edit</AppButton>
          <AppButton v-else size="small" variant="ghost" @click="override = false">Hide</AppButton>
        </span>
      </div>

      <AppAlert v-if="store.newSecretDraft" type="success" title="Encrypted draft ready">
        Ciphertext for {{ store.newSecretDraft.name }} is queued in the shared review and delivery panel below. The plaintext Secret is no longer held on this page.
      </AppAlert>
    </div>

    <div v-show="open" class="flex flex-col gap-3">
      <AppRadioGroup
        v-model="mode"
        name="secret-source"
        :options="sources"
        ariaLabel="Secret source"
      />

      <AppAlert v-if="adopting" type="info" title="Adopt an existing Secret">
        Read it with <code class="font-mono">{{ kubectlCommand }}</code> and paste the output below.
        The live object's runtime metadata and apply annotations are stripped before sealing, so only
        the Secret's content is versioned. Nothing is read from the cluster by this application.
      </AppAlert>

      <AppInput ref="nameInput" v-model="name" ariaLabel="New secret name" :placeholder="adopting ? 'Name, exactly as metadata.name' : 'Secret name'" />

      <AppRadioGroup
        v-model="scope"
        name="secret-scope"
        :options="scopes"
        ariaLabel="Secret scope"
      />

      <AppSelect
        v-if="currentNsPaths && allowedPaths.length > 0"
        v-model="targetPath"
        label="Target directory"
        :hint="`Default: ${defaultPath}`"
        :options="pathOptions"
      />

      <AppTextarea
        v-model="yaml"
        ariaLabel="New secret YAML"
        :placeholder="adopting ? 'Output of the kubectl command above' : 'Complete Kubernetes Secret YAML'"
        :rows="6"
      />

      <div>
        <AppButton
          variant="primary"
          icon="lock"
          :loading="loading"
          :disabled="!name || !yaml || holdsOnlyTemplate"
          @click="createDraft"
        >
          Encrypt for review
        </AppButton>
      </div>

      <!-- Withheld while a draft is held: submitting reseeds the template, so without this the
           card would ask for the entries it has just been given. -->
      <AppAlert v-if="holdsOnlyTemplate && name && !store.newSecretDraft" type="info" title="Fill in the template">
        Replace the empty <code class="font-mono">key</code> with the entries this Secret needs, then encrypt.
      </AppAlert>

      <AppAlert v-if="error" type="error" title="Unable to encrypt">{{ error }}</AppAlert>
    </div>
  </AppCard>
</template>
