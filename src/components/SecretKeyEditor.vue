<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import { NAlert, NButton, NCard, NInput, NSelect, NSpace, NTag } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import type { SealedSecretDetail } from '@/types'

const props = defineProps<{ detail: SealedSecretDetail }>()
const auth = useAuthStore()
const store = useSecretsStore()
const revealed = reactive<Record<string, string>>({})
const replacements = reactive<Record<string, string>>({})
const operation = reactive<Record<string, 'replace' | 'add' | 'delete'>>({})
const activeKey = ref('')
const message = ref('')
const error = ref('')
const canReveal = computed(() => auth.hasCapability(props.detail.namespace, 'secret:decrypt'))
const canPatch = computed(() => auth.hasCapability(props.detail.namespace, 'secret:seal') && canReveal.value && props.detail.git.in_sync_with_live)

async function reveal(key: string) {
  if (!canReveal.value) return
  error.value = ''; activeKey.value = key
  try { revealed[key] = (await store.reveal(props.detail.namespace, props.detail.name, key, props.detail.git.base_commit)).value }
  catch (e) { error.value = e instanceof Error ? e.message : 'Reveal failed' }
  finally { activeKey.value = '' }
}

async function review(key: string) {
  const selectedOperation = operation[key] || 'replace'
  if (!canPatch.value || (selectedOperation !== 'delete' && !replacements[key])) return
  error.value = ''; activeKey.value = key
  try { await store.computeDiff(props.detail.namespace, props.detail.name, key, selectedOperation, replacements[key] || '', props.detail.git.base_commit); message.value = 'Encrypted diff is ready for review.' }
  catch (e) { error.value = e instanceof Error ? e.message : 'Diff failed' }
  finally { activeKey.value = '' }
}

function clear(key?: string) {
  if (key) { delete revealed[key]; delete replacements[key]; delete operation[key] }
  else { Object.keys(revealed).forEach((item) => delete revealed[item]); Object.keys(replacements).forEach((item) => delete replacements[item]) }
  if (store.currentDiff) { store.currentDiff = null; store.pendingMutation = null }
}

onBeforeUnmount(() => clear())
</script>

<template>
  <NCard title="Secret keys" segmented>
    <NAlert v-if="!detail.git.in_sync_with_live" type="warning" title="Editing disabled">Git and live state differ. Resolve drift before revealing or editing values.</NAlert>
    <NAlert v-if="!canReveal" type="info" title="Values concealed">You can inspect encrypted key names, but this namespace does not grant reveal access.</NAlert>
    <NAlert v-if="error" type="error" title="Operation failed" closable @close="error = ''">{{ error }}</NAlert>
    <NAlert v-if="message" type="success" closable @close="message = ''">{{ message }}</NAlert>
    <div v-for="key in detail.keys || []" :key="key" class="key-row">
      <div class="key-name"><code>{{ key }}</code><NTag size="small">concealed</NTag></div>
      <NSpace align="center" wrap>
        <NButton v-if="!revealed[key]" :disabled="!canReveal || !!activeKey" @click="reveal(key)">Reveal one key</NButton>
        <template v-else>
          <NInput v-model:value="revealed[key]" readonly type="password" show-password-on="click" :aria-label="`Revealed value for ${key}`" />
          <NInput v-model:value="replacements[key]" type="password" show-password-on="click" :aria-label="`Replacement value for ${key}`" placeholder="Replacement value" />
          <NSelect v-model:value="operation[key]" :options="[{ label: 'Replace', value: 'replace' }, { label: 'Add', value: 'add' }, { label: 'Delete', value: 'delete' }]" :disabled="!canPatch" :aria-label="`Operation for ${key}`" />
          <NButton type="primary" :loading="activeKey === key" :disabled="!canPatch || (operation[key] !== 'delete' && !replacements[key])" @click="review(key)">Review encrypted diff</NButton>
          <NButton secondary @click="clear(key)">Clear</NButton>
        </template>
      </NSpace>
    </div>
    <NAlert v-if="store.currentDiff" type="info" title="Encrypted diff ready">The server returned encrypted before/after content. Delivery controls appear after review.</NAlert>
  </NCard>
</template>
