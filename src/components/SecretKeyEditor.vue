<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppRadioGroup from '@/components/ui/AppRadioGroup.vue'
import AppSecretInput from '@/components/ui/AppSecretInput.vue'
import AppTag from '@/components/ui/AppTag.vue'
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

const OPERATIONS = [
  { label: 'Replace', value: 'replace' },
  { label: 'Add', value: 'add' },
  { label: 'Delete', value: 'delete' },
]

// The radio group is a string-valued control, but the record it feeds is the
// closed set the store accepts. Narrowing here keeps the assignment honest
// instead of widening `operation` and losing the union everywhere downstream.
function setOperation(key: string, value: string) {
  operation[key] = value as 'replace' | 'add' | 'delete'
}

async function reveal(key: string) {
  if (!canReveal.value || !props.detail.git.base_commit) return
  error.value = ''; activeKey.value = key
  try { revealed[key] = (await store.reveal(props.detail.namespace, props.detail.name, key, props.detail.git.base_commit)).value; operation[key] = operation[key] || 'replace' }
  catch (e) { error.value = e instanceof Error ? e.message : 'Reveal failed' }
  finally { activeKey.value = '' }
}

async function review(key: string) {
  const selectedOperation = operation[key] || 'replace'
  if (!canPatch.value || !props.detail.git.base_commit || (selectedOperation !== 'delete' && !replacements[key])) return
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
  <AppCard title="Secret keys" icon="key">
    <AppAlert v-if="!detail.git.in_sync_with_live" type="warning" title="Editing disabled" class="mb-3">Git and live state differ. Resolve drift before revealing or editing values.</AppAlert>
    <AppAlert v-if="!canReveal" type="info" title="Values concealed" class="mb-3">You can inspect encrypted key names, but this namespace does not grant reveal access.</AppAlert>
    <AppAlert v-if="error" type="error" title="Operation failed" closable class="mb-3" @close="error = ''">{{ error }}</AppAlert>
    <AppAlert v-if="message" type="success" closable class="mb-3" @close="message = ''">{{ message }}</AppAlert>

    <!-- border-t rather than a divider element: the first row is the one that
         must not draw one, which reads as a rule between rows and no rule
         above the list. -->
    <div
      v-for="key in detail.keys || []"
      :key="key"
      class="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3 first:border-t-0"
    >
      <div class="flex items-center gap-2">
        <code class="font-mono text-sm">{{ key }}</code>
        <AppTag>concealed</AppTag>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <AppButton v-if="canReveal && !revealed[key]" :disabled="!!activeKey" @click="reveal(key)">
          Reveal one key
        </AppButton>

        <template v-else-if="revealed[key]">
          <AppSecretInput
            v-model="revealed[key]"
            readonly
            :aria-label="`Revealed value for ${key}`"
          />
          <AppSecretInput
            v-model="replacements[key]"
            placeholder="Replacement value"
            :aria-label="`Replacement value for ${key}`"
          />
          <AppRadioGroup
            :model-value="operation[key] || 'replace'"
            :name="`operation-${key}`"
            :options="OPERATIONS"
            :aria-label="`Operation for ${key}`"
            :disabled="!canPatch"
            @update:model-value="setOperation(key, $event)"
          />
          <AppButton
            variant="primary"
            :loading="activeKey === key"
            :disabled="!canPatch || (operation[key] !== 'delete' && !replacements[key])"
            @click="review(key)"
          >
            Review encrypted diff
          </AppButton>
          <AppButton @click="clear(key)">Clear</AppButton>
        </template>
      </div>
    </div>

    <AppAlert v-if="store.currentDiff" type="info" title="Encrypted diff ready" class="mt-3">The server returned encrypted before/after content. Review and delivery controls are in the panel below.</AppAlert>
  </AppCard>
</template>
