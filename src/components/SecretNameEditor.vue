<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { NAlert, NButton, NCard, NInput, NRadio, NRadioGroup, NSpace, NSelect } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import type { NamespaceGitPaths } from '@/types'

const props = defineProps<{ namespace: string; baseCommit: string }>()
const auth = useAuthStore()
const store = useSecretsStore()
const name = ref(''); const yaml = ref(''); const scope = ref('strict'); const targetPath = ref(''); const error = ref(''); const loading = ref(false)
const canCreate = computed(() => auth.hasCapability(props.namespace, 'secret:seal'))
const gitPaths = computed(() => store.gitPaths)
const scopes = [{ label: 'Strict', value: 'strict' }, { label: 'Namespace-wide', value: 'namespace-wide' }, { label: 'Cluster-wide', value: 'cluster-wide' }]

// Get allowed paths for the current namespace
const currentNsPaths = computed((): NamespaceGitPaths | undefined => {
  return gitPaths.value?.namespaces?.find(ns => ns.namespace === props.namespace)
})
const allowedPaths = computed(() => currentNsPaths.value?.allowed_paths || [])
const defaultPath = computed(() => currentNsPaths.value?.default_path || '')

onMounted(() => {
  store.fetchGitPaths()
})

async function createDraft() {
  if (!canCreate.value || !name.value || !yaml.value) return
  error.value = ''; loading.value = true
  try {
    await store.createNewSecretDraft(props.namespace, name.value, yaml.value, scope.value, props.baseCommit, targetPath.value || undefined)
    yaml.value = ''
  } catch (e) { error.value = e instanceof Error ? e.message : 'Encryption failed' }
  finally { loading.value = false }
}

function discard() {
  store.discardNewSecretDraft()
  name.value = ''; yaml.value = ''; targetPath.value = ''
}
</script>

<template>
  <NCard v-if="canCreate" title="Create new SealedSecret" segmented>
    <NSpace vertical>
      <NInput v-model:value="name" placeholder="Secret name" :input-props="{ 'aria-label': 'New secret name' }" />
      <NRadioGroup v-model:value="scope" name="secret-scope">
        <NSpace>
          <NRadio v-for="option in scopes" :key="option.value" :value="option.value">{{ option.label }}</NRadio>
        </NSpace>
      </NRadioGroup>
      <div v-if="currentNsPaths && allowedPaths.length > 0" class="target-path-selector">
        <label class="select-label">Target directory</label>
        <NSelect v-model:value="targetPath" :options="[{ label: defaultPath, value: '' }, ...allowedPaths.map(p => ({ label: p, value: p }))]" placeholder="Use default path" style="width: 100%" />
        <p class="select-hint">Default: {{ defaultPath }}</p>
      </div>
      <NInput v-model:value="yaml" type="textarea" placeholder="Complete Kubernetes Secret YAML" :autosize="{ minRows: 5, maxRows: 12 }" :input-props="{ 'aria-label': 'New secret YAML' }" />
      <NButton type="primary" :loading="loading" :disabled="!name || !yaml" @click="createDraft">Encrypt for review</NButton>
      <NAlert v-if="error" type="error" title="Unable to encrypt">{{ error }}</NAlert>
      <NAlert v-if="store.newSecretDraft" type="success" title="Encrypted draft ready">
        Ciphertext for {{ store.newSecretDraft.name }} is queued in the shared review and delivery panel below. The plaintext Secret is no longer held on this page.
      </NAlert>
      <NButton v-if="store.newSecretDraft" secondary @click="discard">Discard encrypted draft</NButton>
    </NSpace>
  </NCard>
</template>

<style scoped>
.target-path-selector { display: flex; flex-direction: column; gap: 4px; }
.select-label { font-weight: 500; font-size: 0.875rem; }
.select-hint { margin: 0; font-size: 0.75rem; color: var(--text-color-2); }
</style>