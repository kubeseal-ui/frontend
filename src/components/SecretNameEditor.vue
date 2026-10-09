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
import { ApiError } from '@/api'
import type { NamespaceGitPaths } from '@/types'

/**
 * One form for both ways a Secret gets under management: writing it here, and
 * bringing an existing live one in.
 *
 * The second is adoption, and it needs no separate machinery — a SealedSecret
 * is produced from a Secret manifest either way, and `kubectl get secret -o yaml`
 * emits exactly that manifest. What it needs is to be *sayable*: the source
 * toggle is what makes the capability visible, and the guidance below is what
 * makes the result a clean manifest rather than a copy of the live object's
 * bookkeeping. The server normalizes either way, so the two paths cannot
 * diverge in what they seal.
 *
 * The textarea is the one place in the app that holds a whole Secret in
 * plaintext. It lives here and nowhere else — never in the store — and is
 * cleared on submit, on discard, and on unmount.
 *
 * "Cleared" means reset to the template below rather than to nothing: the
 * template carries no values, so no plaintext survives it, and the alternative
 * is asking the operator to retype apiVersion/kind/metadata for every Secret.
 *
 * baseCommit is the branch head to deliver against, and it is optional: callers
 * that do not already hold one (the create page) omit it and take the head the
 * server reports back from the encrypt call, which is where the vacancy check
 * happens. Callers that hold one — the detail page — still win with it.
 */
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

// The allowed paths for this namespace, resolved through the store so a `*`
// mapping counts. A wildcard names no paths, which leaves the picker below
// unrendered and submits no target_path at all — the server then renders the
// path from the mapping's template, which is the only correct answer here
// because the template is not in the listing.
const currentNsPaths = computed((): NamespaceGitPaths | null => store.namespaceGitPaths(props.namespace))
const allowedPaths = computed(() => currentNsPaths.value?.allowed_paths || [])
const defaultPath = computed(() => currentNsPaths.value?.default_path || '')
const pathOptions = computed(() => [{ label: 'Use default path', value: '' }, ...allowedPaths.value.map(p => ({ label: p, value: p }))])

/**
 * A Secret manifest with the shape every accepted submission needs, so the
 * operator writes values instead of retyping the document's frame.
 *
 * The name line is rendered from the Name field, never typed twice. The server
 * refuses a manifest whose metadata.name disagrees with the request that
 * carries it, so two places to write the name is two places to get it wrong.
 *
 * stringData holds one key with an empty value, and that emptiness is the
 * point: whatever is in this box is what gets sealed, so a template that reads
 * like real data is a template someone will eventually deliver.
 */
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

/**
 * Moves the template's name line to `next`, returning null for a document this
 * component may not rewrite.
 *
 * The line is found *after* `metadata:` rather than anywhere in the document,
 * so a Secret key that happens to be called `name` further down in stringData
 * is never the line that moves. A document whose name line no longer reads as
 * the value last rendered here has been edited by hand, and is left alone.
 */
function rewriteTemplateName(doc: string, previous: string, next: string): string | null {
  const anchor = doc.indexOf('\nmetadata:')
  if (anchor === -1) return null
  const from = `  name: ${nameLine(previous)}`
  const at = doc.indexOf(from, anchor)
  if (at === -1) return null
  return `${doc.slice(0, at)}  name: ${nameLine(next)}${doc.slice(at + from.length)}`
}

// The template as it stands for the current Name field, and as it stood for
// the name last rendered into the box. The second is what lets a re-seed tell
// "still mine" from "the operator has taken this over".
const pristineTemplate = computed(() => templateFor(name.value, props.namespace))
const renderedName = ref('')

/**
 * True while the box holds nothing but the template as rendered. Submitting it
 * would seal one empty value — unreachable before, when the box started empty,
 * so the control stays withheld rather than merely unwise.
 */
const holdsOnlyTemplate = computed(() => yaml.value === pristineTemplate.value)

/** Writes the template over content this component owns: empty, or its own last render. */
function seedTemplate() {
  renderedName.value = name.value
  yaml.value = pristineTemplate.value
}

function seedTemplateIfUntouched() {
  if (yaml.value === '' || yaml.value === templateFor(renderedName.value, props.namespace)) seedTemplate()
}

// The name line follows the Name field so the two cannot disagree. A document
// the operator wrote or pasted is never rewritten by a keystroke in that field.
watch(name, (next) => {
  const rewritten = rewriteTemplateName(yaml.value, renderedName.value, next)
  renderedName.value = next
  if (rewritten !== null) yaml.value = rewritten
})

// The two sources want different boxes: a template to fill in, or an empty one
// to paste `kubectl get secret -o yaml` into. Switching moves between them over
// content this component owns, so a manifest already written or pasted survives
// a change of mind about where it came from.
watch(mode, (next) => {
  if (next === 'create') { seedTemplateIfUntouched(); return }
  if (holdsOnlyTemplate.value) yaml.value = ''
})

onMounted(() => {
  if (mode.value === 'create') seedTemplate()
  // Shared with the create page's rail, which reads the same listing. Only the
  // first of the two to mount needs to ask; a failed attempt leaves gitPaths
  // null and so is retried here.
  if (!store.gitPaths) store.fetchGitPaths()
})

async function createDraft() {
  if (!canCreate.value || !name.value || !yaml.value || holdsOnlyTemplate.value) return
  error.value = ''; loading.value = true
  try {
    await store.createNewSecretDraft(props.namespace, name.value, yaml.value, scope.value, props.baseCommit, targetPath.value || undefined)
    // The name is kept so a Secret the operator is about to write next door
    // needs no retyping; the manifest is reset to a template with no values.
    seedTemplate()
  } catch (e) {
    // Both refusals are about which manifest this is, and both are worth
    // restating in the terms the operator is working in rather than echoing
    // the envelope message alone.
    if (e instanceof ApiError && e.code === 'PATH_OCCUPIED') {
      error.value = `${e.message} Use the existing Secret instead: open it from the namespace list and edit one value there.`
    } else if (e instanceof ApiError && e.code === 'INVALID_MANIFEST') {
      error.value = `${e.message} Check that the name above matches metadata.name in the manifest, and that it is a Secret rather than a SealedSecret.`
    } else {
      error.value = e instanceof Error ? e.message : 'Encryption failed'
    }
  }
  finally { loading.value = false }
}

function discard() {
  store.discardNewSecretDraft()
  name.value = ''; targetPath.value = ''
  seedTemplate()
}

// The plaintext manifest is the widest single window on a Secret anywhere in
// the app, and leaving one in a component that is about to be torn down is the
// easiest way for it to outlive the page it was pasted on.
onUnmounted(() => { yaml.value = '' })
</script>

<template>
  <AppCard v-if="canCreate" title="Create new SealedSecret" icon="plus">
    <div class="flex flex-col gap-3">
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

      <AppInput v-model="name" ariaLabel="New secret name" :placeholder="adopting ? 'Name, exactly as metadata.name' : 'Secret name'" />

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

      <!-- The template making the box non-empty must not read as "ready to
           send": an unedited one would seal a single empty value. -->
      <AppAlert v-if="holdsOnlyTemplate && name" type="info" title="Fill in the template">
        Replace the empty <code class="font-mono">key</code> with the entries this Secret needs, then encrypt.
      </AppAlert>

      <AppAlert v-if="error" type="error" title="Unable to encrypt">{{ error }}</AppAlert>
      <AppAlert v-if="store.newSecretDraft" type="success" title="Encrypted draft ready">
        Ciphertext for {{ store.newSecretDraft.name }} is queued in the shared review and delivery panel below. The plaintext Secret is no longer held on this page.
      </AppAlert>

      <div v-if="store.newSecretDraft">
        <AppButton @click="discard">Discard encrypted draft</AppButton>
      </div>
    </div>
  </AppCard>
</template>
