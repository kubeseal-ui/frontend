<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
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

// baseCommit is the branch head to deliver against. It is optional: callers
// that do not already hold one (the create page) omit it and take the head the
// server reports back from the encrypt call, which is where the vacancy check
// happens. Callers that hold one — the detail page — still win with it.
const props = defineProps<{ namespace: string; baseCommit?: string }>()
const auth = useAuthStore()
const store = useSecretsStore()
const name = ref(''); const yaml = ref(''); const scope = ref('strict'); const targetPath = ref(''); const error = ref(''); const loading = ref(false)
const canCreate = computed(() => auth.hasCapability(props.namespace, 'secret:seal'))
const scopes = [{ label: 'Strict', value: 'strict' }, { label: 'Namespace-wide', value: 'namespace-wide' }, { label: 'Cluster-wide', value: 'cluster-wide' }]

// The allowed paths for this namespace, resolved through the store so a `*`
// mapping counts. A wildcard names no paths, which leaves the picker below
// unrendered and submits no target_path at all — the server then renders the
// path from the mapping's template, which is the only correct answer here
// because the template is not in the listing.
const currentNsPaths = computed((): NamespaceGitPaths | null => store.namespaceGitPaths(props.namespace))
const allowedPaths = computed(() => currentNsPaths.value?.allowed_paths || [])
const defaultPath = computed(() => currentNsPaths.value?.default_path || '')
const pathOptions = computed(() => [{ label: 'Use default path', value: '' }, ...allowedPaths.value.map(p => ({ label: p, value: p }))])

onMounted(() => {
  // Shared with the create page's rail, which reads the same listing. Only the
  // first of the two to mount needs to ask; a failed attempt leaves gitPaths
  // null and so is retried here.
  if (!store.gitPaths) store.fetchGitPaths()
})

async function createDraft() {
  if (!canCreate.value || !name.value || !yaml.value) return
  error.value = ''; loading.value = true
  try {
    await store.createNewSecretDraft(props.namespace, name.value, yaml.value, scope.value, props.baseCommit, targetPath.value || undefined)
    yaml.value = ''
  } catch (e) {
    // The server refuses to encrypt onto an occupied mapped path. Say so
    // plainly and point at the flow that is allowed to change that manifest,
    // rather than echoing the envelope message alone.
    if (e instanceof ApiError && e.code === 'PATH_OCCUPIED') {
      error.value = `${e.message} Use the existing Secret instead: open it from the namespace list and edit one value there.`
    } else {
      error.value = e instanceof Error ? e.message : 'Encryption failed'
    }
  }
  finally { loading.value = false }
}

function discard() {
  store.discardNewSecretDraft()
  name.value = ''; yaml.value = ''; targetPath.value = ''
}
</script>

<template>
  <AppCard v-if="canCreate" title="Create new SealedSecret" icon="plus">
    <div class="flex flex-col gap-3">
      <AppInput v-model="name" ariaLabel="New secret name" placeholder="Secret name" />

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

      <AppTextarea v-model="yaml" ariaLabel="New secret YAML" placeholder="Complete Kubernetes Secret YAML" :rows="6" />

      <div>
        <AppButton
          variant="primary"
          icon="lock"
          :loading="loading"
          :disabled="!name || !yaml"
          @click="createDraft"
        >
          Encrypt for review
        </AppButton>
      </div>

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
