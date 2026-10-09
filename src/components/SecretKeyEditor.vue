<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref } from 'vue'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppRadioGroup from '@/components/ui/AppRadioGroup.vue'
import AppSecretInput from '@/components/ui/AppSecretInput.vue'
import AppTag from '@/components/ui/AppTag.vue'
import { describeError } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import type { Mutation, MutationOperation, SealedSecretDetail } from '@/types'

// Every staged change — replacement, deletion, new key — lands in one diff and one
// commit. Revealing stays one key at a time, and a delete needs no reveal.
const props = defineProps<{ detail: SealedSecretDetail }>()
const auth = useAuthStore()
const store = useSecretsStore()
const revealed = reactive<Record<string, string>>({})
const replacements = reactive<Record<string, string>>({})
const operation = reactive<Record<string, MutationOperation>>({})
/** Open edit controls: revealed, or opened to change without revealing. */
const editing = reactive<Record<string, boolean>>({})
const added = ref<{ id: number; key: string; value: string }[]>([])
const activeKey = ref('')
const reviewing = ref(false)
const message = ref('')
const error = ref('')
const canReveal = computed(() => auth.hasCapability(props.detail.namespace, 'secret:decrypt'))
const canPatch = computed(() => auth.hasCapability(props.detail.namespace, 'secret:seal') && canReveal.value && props.detail.git.in_sync_with_live)

// An add over a key that is present is refused by the API, so it is not offered.
const EXISTING_OPERATIONS = [
  { label: 'Replace', value: 'replace' },
  { label: 'Delete', value: 'delete' },
]

let nextRowId = 0

function setOperation(key: string, value: string) {
  operation[key] = value as MutationOperation
}

function hasRevealed(key: string) {
  return revealed[key] !== undefined
}

async function reveal(key: string) {
  if (!canReveal.value || !props.detail.git.base_commit) return
  error.value = ''; activeKey.value = key
  try {
    revealed[key] = (await store.reveal(props.detail.namespace, props.detail.name, key, props.detail.git.base_commit)).value
    editing[key] = true
    operation[key] = operation[key] || 'replace'
  }
  catch (e) { error.value = describeError(e, 'The key could not be revealed') }
  finally { activeKey.value = '' }
}

function startEdit(key: string) {
  editing[key] = true
  operation[key] = operation[key] || 'replace'
}

function addRow() {
  added.value.push({ id: nextRowId++, key: '', value: '' })
}

const batch = computed<Mutation[]>(() => {
  const out: Mutation[] = []
  for (const key of props.detail.keys || []) {
    if (!editing[key]) continue
    const op = operation[key] || 'replace'
    out.push({ key, operation: op, value: op === 'delete' ? '' : replacements[key] || '' })
  }
  for (const row of added.value) {
    out.push({ key: row.key.trim(), operation: 'add', value: row.value })
  }
  return out
})

// The server refuses all of these too, so this is not a second set of rules — it avoids
// a round trip, and a decrypt's worth of audit trail, on a request already known to fail.
const batchProblem = computed(() => {
  if (batch.value.length === 0) return ''
  if (batch.value.some((entry) => entry.key === '')) return 'Every key being added needs a name.'
  if (batch.value.some((entry) => entry.operation !== 'delete' && entry.value === '')) return 'Every key being changed needs a value.'
  const taken = new Set(props.detail.keys || [])
  const collisions = new Set<string>()
  for (const row of added.value) {
    const key = row.key.trim()
    if (key === '') continue
    if (taken.has(key)) collisions.add(key)
    taken.add(key)
  }
  if (collisions.size > 0) return `Every new key needs a name the Secret does not already use: ${[...collisions].join(', ')}.`
  return ''
})
const canReview = computed(() => canPatch.value && batchProblem.value === '')

async function reviewBatch() {
  if (!canReview.value || !props.detail.git.base_commit) return
  error.value = ''; reviewing.value = true
  try {
    await store.computeDiff(props.detail.namespace, props.detail.name, batch.value, props.detail.git.base_commit)
    message.value = 'Encrypted diff is ready for review.'
  }
  catch (e) { error.value = describeError(e, 'The encrypted diff could not be computed') }
  finally { reviewing.value = false }
}

function clear(key?: string) {
  if (key) {
    delete revealed[key]; delete replacements[key]; delete operation[key]; delete editing[key]
  } else {
    Object.keys(revealed).forEach((item) => delete revealed[item])
    Object.keys(replacements).forEach((item) => delete replacements[item])
    Object.keys(operation).forEach((item) => delete operation[item])
    Object.keys(editing).forEach((item) => delete editing[item])
    added.value = []
  }
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
        <AppButton v-if="canReveal && !hasRevealed(key)" :disabled="!!activeKey" @click="reveal(key)">
          Reveal one key
        </AppButton>
        <AppButton v-if="canReveal && !editing[key]" :aria-label="`Change ${key}`" @click="startEdit(key)">
          Change
        </AppButton>

        <template v-if="editing[key]">
          <AppSecretInput
            v-if="hasRevealed(key)"
            v-model="revealed[key]"
            readonly
            :ariaLabel="`Revealed value for ${key}`"
          />
          <AppSecretInput
            v-model="replacements[key]"
            placeholder="Replacement value"
            :ariaLabel="`Replacement value for ${key}`"
          />
          <AppRadioGroup
            :model-value="operation[key] || 'replace'"
            :name="`operation-${key}`"
            :options="EXISTING_OPERATIONS"
            :ariaLabel="`Operation for ${key}`"
            :disabled="!canPatch"
            @update:model-value="setOperation(key, $event)"
          />
          <AppButton @click="clear(key)">Clear</AppButton>
        </template>
      </div>
    </div>

    <div
      v-for="(row, index) in added"
      :key="row.id"
      class="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3"
    >
      <div class="flex flex-wrap items-center gap-2">
        <!-- `field` is `w-full`, so it needs a sized flex parent, not the row itself. -->
        <span class="flex min-w-[11rem] flex-1 items-center">
          <input v-model="row.key" :aria-label="`New key name ${index + 1}`" placeholder="Key name" class="field font-mono" />
        </span>
        <AppTag>new</AppTag>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <AppSecretInput v-model="row.value" placeholder="Value" :ariaLabel="`New key value ${index + 1}`" />
        <AppButton :aria-label="`Remove new key ${index + 1}`" @click="added.splice(index, 1)">Remove</AppButton>
      </div>
    </div>

    <div v-if="canReveal" class="mt-4 flex flex-wrap items-center gap-2">
      <AppButton v-if="canPatch" @click="addRow">Add key</AppButton>
      <AppButton
        v-if="batch.length > 0"
        variant="primary"
        :loading="reviewing"
        :disabled="!canReview"
        @click="reviewBatch"
      >
        Review encrypted diff
      </AppButton>
    </div>
    <p v-if="batchProblem" class="mt-2 mb-0 text-sm text-muted">{{ batchProblem }}</p>

    <AppAlert v-if="store.currentDiff" type="info" title="Encrypted diff ready" class="mt-3">The server returned encrypted before/after content. Review and delivery controls are in the panel below.</AppAlert>
  </AppCard>
</template>
