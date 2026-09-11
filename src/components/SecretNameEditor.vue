<script setup lang="ts">
import { computed, ref } from 'vue'
import { NAlert, NButton, NCard, NInput, NSelect, NSpace } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/api'

const props = defineProps<{ namespace: string }>()
const auth = useAuthStore()
const name = ref(''); const yaml = ref(''); const scope = ref('strict'); const error = ref(''); const loading = ref(false); const result = ref('')
const canCreate = computed(() => auth.hasCapability(props.namespace, 'secret:seal'))
const scopes = [{ label: 'Strict', value: 'strict' }, { label: 'Namespace-wide', value: 'namespace-wide' }, { label: 'Cluster-wide', value: 'cluster-wide' }]
async function createDraft() {
  if (!canCreate.value || !name.value || !yaml.value) return
  error.value = ''; result.value = ''; loading.value = true
  try {
    const response = await api.post<{ yaml: string }>('/api/v1/secrets/encrypt', { namespace: props.namespace, name: name.value, yaml: yaml.value, scope: scope.value })
    result.value = response.data.yaml
    yaml.value = ''
  } catch (e) { error.value = e instanceof Error ? e.message : 'Encryption failed' }
  finally { loading.value = false }
}
</script>

<template>
  <NCard v-if="canCreate" title="Create new SealedSecret" segmented>
    <NSpace vertical>
      <NInput v-model:value="name" aria-label="New secret name" placeholder="Secret name" />
      <NSelect v-model:value="scope" :options="scopes" aria-label="Secret scope" />
      <NInput v-model:value="yaml" type="textarea" aria-label="New secret YAML" placeholder="Complete Kubernetes Secret YAML" :autosize="{ minRows: 5, maxRows: 12 }" />
      <NButton type="primary" :loading="loading" :disabled="!name || !yaml" @click="createDraft">Encrypt for review</NButton>
      <NAlert v-if="error" type="error" title="Unable to encrypt">{{ error }}</NAlert>
      <NAlert v-if="result" type="success" title="Encrypted draft ready">The encrypted manifest is ready for diff review and delivery.</NAlert>
    </NSpace>
  </NCard>
</template>
