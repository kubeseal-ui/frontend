<script setup lang="ts">
import { ref } from 'vue'
import { NAlert, NButton, NCard, NCode, NSpace } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import type { SealedSecretDetail } from '@/types'

const props = defineProps<{ detail: SealedSecretDetail }>()
const auth = useAuthStore(); const store = useSecretsStore(); const loading = ref(false); const applying = ref(false); const error = ref(''); const result = ref(''); const encryptedDraft = ref('')
const mode = props.detail.git.delivery_mode
const canDeliver = mode === 'direct' ? auth.hasCapability(props.detail.namespace, 'gitops:push') : auth.hasCapability(props.detail.namespace, 'gitops:propose')
const actionLabel = mode === 'direct' ? 'Deliver directly' : 'Create proposal'
async function applyPatch() {
  if (!store.currentDiff) return
  applying.value = true; error.value = ''; result.value = ''
  try { const response = await store.applyReviewedMutation(); encryptedDraft.value = response.yaml; result.value = 'Encrypted patch applied and ready for delivery.' }
  catch (e) { error.value = e instanceof Error ? e.message : 'Patch failed' }
  finally { applying.value = false }
}
async function deliver() {
  const yaml = encryptedDraft.value || store.currentDiff?.after
  if (!yaml || !canDeliver) return
  loading.value = true; error.value = ''; result.value = ''
  try { const response = await store.deliver(props.detail.namespace, props.detail.name, yaml, store.currentDiff?.base_commit || props.detail.git.base_commit); result.value = response.proposal_url || response.commit_sha }
  catch (e) { error.value = e instanceof Error ? e.message : 'Delivery failed' }
  finally { loading.value = false }
}
</script>

<template>
  <NCard v-if="store.currentDiff || encryptedDraft" title="Encrypted diff and delivery" segmented>
    <NSpace vertical>
      <NAlert type="info" title="Encrypted review">Only encrypted manifests are shown. The server resolved the repository, branch, path, and delivery mode.</NAlert>
      <div v-if="store.currentDiff" class="encrypted-diff" aria-label="Encrypted manifest diff"><strong>Encrypted before</strong><NCode :code="store.currentDiff.before" language="yaml" /><strong>Encrypted after</strong><NCode :code="store.currentDiff.after" language="yaml" /></div>
      <NButton v-if="store.currentDiff && !encryptedDraft" type="primary" :loading="applying" @click="applyPatch">Apply reviewed patch</NButton>
      <NAlert v-if="!canDeliver" type="warning" title="Delivery unavailable">This namespace requires {{ mode }} delivery, but your effective capabilities do not include the required delivery capability.</NAlert>
      <NButton v-else :disabled="!encryptedDraft" type="primary" :loading="loading" @click="deliver">{{ actionLabel }}</NButton>
      <NAlert v-if="error" type="error" title="Operation failed">{{ error }}</NAlert>
      <NAlert v-if="result" type="success" title="Workflow status">{{ result }}. ArgoCD synchronization is not verified by this workflow.</NAlert>
    </NSpace>
  </NCard>
</template>
