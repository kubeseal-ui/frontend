<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { NAlert, NButton, NCard, NCode, NSpace } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import type { SealedSecretDetail } from '@/types'

const props = defineProps<{ detail: SealedSecretDetail }>()
const auth = useAuthStore(); const store = useSecretsStore()
const loading = ref(false); const applying = ref(false); const error = ref(''); const result = ref(''); const encryptedDraft = ref('')

const mode = computed(() => props.detail.git.delivery_mode)
const canDeliver = computed(() => mode.value === 'direct' ? auth.hasCapability(props.detail.namespace, 'gitops:push') : auth.hasCapability(props.detail.namespace, 'gitops:propose'))
const actionLabel = computed(() => mode.value === 'direct' ? 'Deliver directly' : 'Create proposal')
const newSecret = computed(() => store.newSecretDraft)
const hasReview = computed(() => Boolean(store.currentDiff || newSecret.value || encryptedDraft.value))
// The repository, branch, path, and mode always come from the server-side namespace policy.
const target = computed(() => newSecret.value
  ? { namespace: newSecret.value.namespace, name: newSecret.value.name, base_commit: newSecret.value.base_commit }
  : { namespace: props.detail.namespace, name: props.detail.name, base_commit: store.currentDiff?.base_commit || props.detail.git.base_commit })
const reviewedYaml = computed(() => encryptedDraft.value || store.currentDiff?.after || newSecret.value?.yaml || '')

async function applyPatch() {
  if (!store.currentDiff) return
  applying.value = true; error.value = ''; result.value = ''
  try { const response = await store.applyReviewedMutation(); encryptedDraft.value = response.yaml; result.value = 'Encrypted patch applied and ready for delivery.' }
  catch (e) { error.value = e instanceof Error ? e.message : 'Patch failed' }
  finally { applying.value = false }
}

async function deliver() {
  const yaml = reviewedYaml.value
  if (!yaml || !canDeliver.value) return
  loading.value = true; error.value = ''; result.value = ''
  try {
    const response = await store.deliver(target.value.namespace, target.value.name, yaml, target.value.base_commit)
    result.value = response.proposal_url || response.commit_sha
    // Keep the delivered ciphertext on screen for confirmation, drop it from shared state.
    encryptedDraft.value = yaml
    store.discardNewSecretDraft()
  } catch (e) { error.value = e instanceof Error ? e.message : 'Delivery failed' }
  finally { loading.value = false }
}

onBeforeUnmount(() => { encryptedDraft.value = '' })
</script>

<template>
  <NCard v-if="hasReview" title="Encrypted review and delivery" segmented>
    <NSpace vertical>
      <NAlert type="info" title="Encrypted review">Only encrypted manifests are shown. The server resolved the repository, branch, path, and delivery mode.</NAlert>
      <div v-if="store.currentDiff" class="encrypted-diff" aria-label="Encrypted manifest diff"><strong>Encrypted before</strong><NCode :code="store.currentDiff.before" language="yaml" /><strong>Encrypted after</strong><NCode :code="store.currentDiff.after" language="yaml" /></div>
      <div v-else-if="newSecret" class="encrypted-diff" aria-label="Encrypted new secret draft"><strong>Encrypted new SealedSecret {{ newSecret.name }}</strong><NCode :code="newSecret.yaml" language="yaml" /></div>
      <NButton v-if="store.currentDiff && !encryptedDraft" type="primary" :loading="applying" @click="applyPatch">Apply reviewed patch</NButton>
      <NAlert v-if="!canDeliver" type="warning" title="Delivery unavailable">This namespace requires {{ mode }} delivery, but your effective capabilities do not include the required delivery capability.</NAlert>
      <NButton v-else type="primary" :loading="loading" @click="deliver">{{ actionLabel }}</NButton>
      <NAlert v-if="error" type="error" title="Operation failed">{{ error }}</NAlert>
      <NAlert v-if="result" type="success" title="Workflow status">{{ result }}. ArgoCD synchronization is not verified by this workflow.</NAlert>
    </NSpace>
  </NCard>
</template>
