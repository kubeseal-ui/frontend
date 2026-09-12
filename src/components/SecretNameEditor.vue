<script setup lang="ts">
import { computed, ref } from 'vue'
import { NAlert, NButton, NCard, NInput, NRadio, NRadioGroup, NSpace } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'

const props = defineProps<{ namespace: string; baseCommit: string }>()
const auth = useAuthStore()
const store = useSecretsStore()
const name = ref(''); const yaml = ref(''); const scope = ref('strict'); const error = ref(''); const loading = ref(false)
const canCreate = computed(() => auth.hasCapability(props.namespace, 'secret:seal'))
const scopes = [{ label: 'Strict', value: 'strict' }, { label: 'Namespace-wide', value: 'namespace-wide' }, { label: 'Cluster-wide', value: 'cluster-wide' }]

async function createDraft() {
  if (!canCreate.value || !name.value || !yaml.value) return
  error.value = ''; loading.value = true
  try {
    await store.createNewSecretDraft(props.namespace, name.value, yaml.value, scope.value, props.baseCommit)
    // The plaintext Secret is dropped as soon as the server returns ciphertext.
    yaml.value = ''
  } catch (e) { error.value = e instanceof Error ? e.message : 'Encryption failed' }
  finally { loading.value = false }
}

function discard() {
  store.discardNewSecretDraft()
  name.value = ''; yaml.value = ''
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
