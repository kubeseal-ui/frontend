<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppRadioGroup from '@/components/ui/AppRadioGroup.vue'
import AppSecretInput from '@/components/ui/AppSecretInput.vue'
import AppTag from '@/components/ui/AppTag.vue'
import { describeError } from '@/api'
import { refocusAfterCollapse } from '@/utils/refocus'
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
/** Keys opened for editing. The inventory row stays read-only; the change is staged below. */
const editing = reactive<Record<string, boolean>>({})
const added = ref<{ id: number; key: string; value: string }[]>([])
const activeKey = ref('')
const reviewing = ref(false)
const message = ref('')
const error = ref('')
const addInputs = ref<Record<number, HTMLInputElement | null>>({})
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

function operationOf(key: string) {
  return operation[key] || 'replace'
}

function hasRevealed(key: string) {
  return revealed[key] !== undefined
}

const stagedKeys = computed(() => (props.detail.keys || []).filter((key) => editing[key]))
const stagedCount = computed(() => stagedKeys.value.length + added.value.length)

// Revealing is a look, not a change: it stages nothing, so a value read on the way past can
// never block the review with a change nobody asked for. Only Change stages a key, and a
// replacement or a delete still needs no reveal at all.
async function reveal(key: string) {
  if (!canReveal.value || !props.detail.git.base_commit) return
  error.value = ''; activeKey.value = key
  try {
    revealed[key] = (await store.reveal(props.detail.namespace, props.detail.name, key, props.detail.git.base_commit)).value
  }
  catch (e) { error.value = describeError(e, 'The key could not be revealed') }
  finally { activeKey.value = '' }
}

/** Drops the plaintext this page is holding; the Secret itself is untouched. */
function conceal(key: string) {
  delete revealed[key]
}

function startEdit(key: string) {
  editing[key] = true
  operation[key] = operationOf(key)
}

// Focus follows the new row: the tray is where the typing happens, and a click that leaves
// focus on the button makes the keyboard user tab back through the inventory to reach it.
async function addRow() {
  const id = nextRowId++
  added.value.push({ id, key: '', value: '' })
  await nextTick()
  addInputs.value[id]?.focus()
}

function setAddInput(id: number, element: unknown) {
  addInputs.value[id] = element instanceof HTMLInputElement ? element : null
}

const batch = computed<Mutation[]>(() => {
  const out: Mutation[] = []
  for (const key of props.detail.keys || []) {
    if (!editing[key]) continue
    const op = operationOf(key)
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

// A row states its own problem, under the field it belongs to: the sentence above names no
// key, so with several rows staged it is a scan rather than an answer.
function addNameProblem(row: { key: string }) {
  const key = row.key.trim()
  if (key === '') return 'This new key needs a name.'
  if ((props.detail.keys || []).includes(key)) return `This Secret already has a key named ${key}.`
  if (added.value.filter((other) => other.key.trim() === key).length > 1) return 'Two new keys share this name.'
  return ''
}

function addValueProblem(row: { key: string; value: string }) {
  return addNameProblem(row) === '' && row.value === '' ? 'This new key needs a value.' : ''
}

function existingProblem(key: string) {
  return operationOf(key) !== 'delete' && !(replacements[key] || '') ? 'This change needs a value.' : ''
}

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

// Submitting the review is what moves the page on to the panel below, so that is what folds
// this stage. Folding discards nothing: the staged rows are still here behind the toggle, and
// discarding them clears the diff, which brings the editor back rather than leaving it folded
// over a review that no longer exists.
const override = ref<boolean | null>(null)
const open = computed(() => override.value ?? !store.currentDiff)
const toggle = ref<{ $el?: HTMLElement } | null>(null)
const reviewedCount = computed(() => store.currentDiff?.mutations?.length || 0)
const summary = computed(() => (reviewedCount.value === 1 ? '1 change reviewed' : `${reviewedCount.value} changes reviewed`))

watch(() => Boolean(store.currentDiff), async (reviewed, was) => {
  override.value = null
  if (reviewed && !was) await refocusAfterCollapse(() => toggle.value?.$el)
}, { flush: 'post' })

onBeforeUnmount(() => clear())
</script>

<template>
  <AppCard title="Secret keys" icon="key">
    <AppAlert v-if="!detail.git.in_sync_with_live" type="warning" title="Editing disabled" class="mb-3">Git and live state differ. Resolve drift before revealing or editing values.</AppAlert>
    <AppAlert v-if="!canReveal" type="info" title="Values concealed" class="mb-3">You can inspect encrypted key names, but this namespace does not grant reveal access.</AppAlert>
    <AppAlert v-if="error" type="error" title="Operation failed" closable class="mb-3" @close="error = ''">{{ error }}</AppAlert>
    <AppAlert v-if="message" type="success" closable class="mb-3" @close="message = ''">{{ message }}</AppAlert>

    <!-- The review moves the page on to the panel below, so submitting one folds this stage.
         It stays the way back into the keys, and folding discards nothing staged. -->
    <div v-if="!open || store.currentDiff" class="mb-3 flex flex-wrap items-center gap-2">
      <span v-if="!open" class="text-sm text-muted">{{ summary }}</span>
      <AppButton v-if="!open" ref="toggle" size="small" variant="ghost" class="ml-auto" @click="override = true">Edit</AppButton>
      <AppButton v-else size="small" variant="ghost" class="ml-auto" @click="override = false">Hide</AppButton>
    </div>

    <!-- The inventory is read-only: a row says what the Secret has — and, while revealed, what
         one value is — never what is being changed, so staging an add cannot rearrange the keys
         already here. -->
    <div
      v-for="key in detail.keys || []"
      v-show="open"
      :key="key"
      class="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3 first:border-t-0"
    >
      <div class="flex items-center gap-2">
        <code class="font-mono text-sm">{{ key }}</code>
        <AppTag v-if="editing[key]" tone="accent">{{ operationOf(key) }}</AppTag>
        <AppTag v-else>concealed</AppTag>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <AppSecretInput
          v-if="hasRevealed(key)"
          v-model="revealed[key]"
          readonly
          :ariaLabel="`Revealed value for ${key}`"
        />
        <AppButton v-if="canReveal && !hasRevealed(key)" :disabled="!!activeKey" @click="reveal(key)">
          Reveal one key
        </AppButton>
        <AppButton v-if="hasRevealed(key)" :aria-label="`Conceal ${key}`" @click="conceal(key)">
          Conceal
        </AppButton>
        <AppButton v-if="canReveal && !editing[key]" :aria-label="`Change ${key}`" @click="startEdit(key)">
          Change
        </AppButton>
      </div>
    </div>

    <!-- Always on screen while reveal is available, so an absent tray could never be read
         as "nothing staged" — the empty state says it instead. -->
    <div
      v-if="canReveal"
      v-show="open"
      class="mt-4 rounded-card-inner border"
      :class="stagedCount > 0 ? 'border-accent/40 bg-accent/5' : 'border-border'"
    >
      <div class="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
        <span class="text-sm font-medium" :class="stagedCount > 0 ? 'text-accent' : 'text-muted'">
          {{ stagedCount === 0 ? 'Staged changes' : (stagedCount === 1 ? '1 staged change' : `${stagedCount} staged changes`) }}
        </span>
        <AppButton v-if="stagedCount > 0" size="small" variant="ghost" class="ml-auto" @click="clear()">Discard all</AppButton>
      </div>

      <p v-if="stagedCount === 0" class="px-4 py-3 text-sm text-muted">
        Nothing staged. Reveal or change a key, or add one the Secret does not have.
      </p>

      <ul v-else class="flex flex-col">
        <li
          v-for="(key, index) in stagedKeys"
          :key="key"
          class="flex flex-col gap-2 border-t border-border px-4 py-3 first:border-t-0"
          :class="existingProblem(key) ? 'bg-danger/5' : ''"
        >
          <div class="flex flex-wrap items-center gap-2">
            <AppRadioGroup
              :model-value="operationOf(key)"
              :name="`operation-${key}`"
              :options="EXISTING_OPERATIONS"
              :ariaLabel="`Operation for ${key}`"
              :disabled="!canPatch"
              @update:model-value="setOperation(key, $event)"
            />
            <code class="font-mono text-sm">{{ key }}</code>
            <AppButton
              class="ml-auto"
              size="small"
              variant="ghost"
              :aria-label="`Discard the staged change to ${key}`"
              @click="clear(key)"
            >
              Discard
            </AppButton>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <AppSecretInput
              v-if="operationOf(key) !== 'delete'"
              v-model="replacements[key]"
              placeholder="Replacement value"
              :ariaLabel="`Replacement value for ${key}`"
              :invalid="!!existingProblem(key)"
              :describedBy="existingProblem(key) ? `staged-problem-${index}` : ''"
            />
            <p v-else class="mb-0 text-sm text-muted">Deletes the key; no value is needed.</p>
          </div>

          <p v-if="existingProblem(key)" :id="`staged-problem-${index}`" class="mb-0 text-sm text-danger">
            {{ existingProblem(key) }}
          </p>
        </li>

        <li
          v-for="(row, index) in added"
          :key="row.id"
          class="flex flex-col gap-2 border-t border-border px-4 py-3"
          :class="addNameProblem(row) || addValueProblem(row) ? 'bg-danger/5' : ''"
        >
          <div class="flex flex-wrap items-center gap-2">
            <AppTag tone="accent">add</AppTag>
            <span class="flex min-w-[11rem] flex-1 items-center">
              <input
                :ref="(element) => setAddInput(row.id, element)"
                v-model="row.key"
                :aria-label="`New key name ${index + 1}`"
                :aria-invalid="addNameProblem(row) ? 'true' : undefined"
                :aria-describedby="addNameProblem(row) ? `new-problem-${row.id}` : undefined"
                placeholder="Key name"
                class="field font-mono"
              />
            </span>
            <AppButton
              class="ml-auto"
              size="small"
              variant="ghost"
              :aria-label="`Remove new key ${index + 1}`"
              @click="added.splice(index, 1)"
            >
              Remove
            </AppButton>
          </div>

          <AppSecretInput
            v-model="row.value"
            placeholder="Value"
            :ariaLabel="`New key value ${index + 1}`"
            :invalid="!!addValueProblem(row)"
            :describedBy="addValueProblem(row) ? `new-problem-${row.id}` : ''"
          />

          <p v-if="addNameProblem(row) || addValueProblem(row)" :id="`new-problem-${row.id}`" class="mb-0 text-sm text-danger">
            {{ addNameProblem(row) || addValueProblem(row) }}
          </p>
        </li>
      </ul>

      <div class="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
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
        <p v-if="batchProblem" class="mb-0 text-sm text-muted" aria-live="polite">{{ batchProblem }}</p>
      </div>
    </div>

    <AppAlert v-if="store.currentDiff" v-show="open" type="info" title="Encrypted diff ready" class="mt-3">The server returned encrypted before/after content. Review and delivery controls are in the panel below.</AppAlert>
  </AppCard>
</template>
