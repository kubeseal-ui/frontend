<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppRadioGroup from '@/components/ui/AppRadioGroup.vue'
import { describeError } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import type { Mutation, MutationOperation, SealedSecretDetail } from '@/types'

// Every staged change — replacement, deletion, new key — lands in one diff and one commit.
// Each key keeps its own Reveal: one decrypt per key, each its own audit event.
const props = defineProps<{ detail: SealedSecretDetail }>()
const emit = defineEmits<{ 'update:batch': [Mutation[]] }>()

const auth = useAuthStore()
const store = useSecretsStore()
const revealed = reactive<Record<string, string>>({})
const replacements = reactive<Record<string, string>>({})
const operation = reactive<Record<string, MutationOperation>>({})
/** Keys whose row is open for editing. The row states what the Secret has; the change is
 *  staged inside it rather than in a tray below, so nothing folds away. */
const editing = reactive<Record<string, boolean>>({})
const added = ref<{ id: number; key: string; value: string }[]>([])
const activeKey = ref('')
const error = ref('')
const addInputs = ref<Record<number, HTMLInputElement | null>>({})
const rows = ref<Record<string, HTMLLIElement | null>>({})

const namespace = computed(() => props.detail.namespace)
const canReveal = computed(() => auth.hasCapability(namespace.value, 'secret:decrypt'))
// The server refuses reveal and patch with a 409 while Git and the cluster differ, so the
// controls that would earn one are withheld rather than offered. Concealing is not gated: it
// drops plaintext this page already holds and sends nothing.
const canRevealValue = computed(() => canReveal.value && props.detail.git.in_sync_with_live)
const canPatch = computed(() => auth.hasCapability(namespace.value, 'secret:seal') && canRevealValue.value)
// The commit every reveal and review is made against. Absent means the server did not report
// one, which the controls that need it refuse rather than send.
const baseCommit = computed(() => props.detail.git.base_commit || '')

// The twelve dots the product is: a value that is there and cannot be read, until one key is
// asked for.
const DOTS = '••••••••••••'

// An add over a key that is present is refused by the API, so it is not offered.
const EXISTING_OPERATIONS = [
  { label: 'Replace the value', value: 'replace' },
  { label: 'Delete the key', value: 'delete' },
]

let nextRowId = 0

// Which rows have been left. A row just opened is not yet wrong, and a field that turns red the
// moment it appears reads as a fault rather than a prompt.
const shown = reactive<Record<string, boolean>>({})
const stagedRowId = (key: string) => `key-${key}`
const addedRowId = (row: { id: number }) => `add-${row.id}`

// Leaving the row is what turns its problems on. Moving between the row's own fields is not
// leaving it, so tabbing from the name to the value does not answer a value not yet typed.
function leave(id: string, event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (next && (event.currentTarget as HTMLElement).contains(next)) return
  shown[id] = true
}

const operationOf = (key: string) => operation[key] || 'replace'
const setOperation = (key: string, value: string) => { operation[key] = value as MutationOperation }
const hasRevealed = (key: string) => revealed[key] !== undefined
const openKeys = computed(() => (props.detail.keys || []).filter((key) => editing[key]))

async function reveal(key: string) {
  if (!canRevealValue.value || !baseCommit.value) return
  error.value = ''; activeKey.value = key
  try {
    revealed[key] = (await store.reveal(namespace.value, props.detail.name, key, baseCommit.value)).value
  } catch (e) { error.value = describeError(e, 'The key could not be revealed') }
  finally { activeKey.value = '' }
}

/** Drops the plaintext this page is holding; the Secret itself is untouched. */
function conceal(key: string) { delete revealed[key] }

// Focus follows the row that was just opened. Change is the button that opened it and is gone
// the moment it is pressed, so without this focus falls to the body and the keyboard user tabs
// back through the inventory to reach the field they just asked for.
async function startEdit(key: string) {
  editing[key] = true
  operation[key] = operationOf(key)
  await nextTick()
  rows.value[key]?.querySelector<HTMLInputElement>(`#staged-input-${CSS.escape(key)}`)?.focus()
}

// A removal is a delete of a key that is here, and the row states it outright rather than as a
// mode of Change: a delete opens no value field, so nothing sits between choosing it and
// reviewing it. Focus follows the option it staged.
async function removeKey(key: string) {
  editing[key] = true
  operation[key] = 'delete'
  await nextTick()
  rows.value[key]?.querySelector<HTMLInputElement>(`input[name="operation-${key}"][value="delete"]`)?.focus()
}

async function addRow() {
  const id = nextRowId++
  added.value.push({ id, key: '', value: '' })
  await nextTick()
  addInputs.value[id]?.focus()
}

function removeAdded(index: number) {
  const [row] = added.value.splice(index, 1)
  if (row) delete shown[addedRowId(row)]
}

const setAddInput = (id: number, element: unknown) => { addInputs.value[id] = element instanceof HTMLInputElement ? element : null }
const setRow = (key: string, element: unknown) => { rows.value[key] = element instanceof HTMLLIElement ? element : null }

function clear(key?: string) {
  if (key) {
    delete revealed[key]; delete replacements[key]; delete operation[key]; delete editing[key]
    delete shown[stagedRowId(key)]
  } else {
    for (const bag of [revealed, replacements, operation, editing, shown]) {
      Object.keys(bag).forEach((item) => delete bag[item])
    }
    added.value = []
  }
}

const batch = computed<Mutation[]>(() => {
  const out: Mutation[] = []
  for (const key of props.detail.keys || []) {
    if (!editing[key]) continue
    const op = operationOf(key)
    out.push({ key, operation: op, value: op === 'delete' ? '' : replacements[key] || '' })
  }
  for (const row of added.value) out.push({ key: row.key.trim(), operation: 'add', value: row.value })
  return out
})

// The surface owns the presses and needs the batch the first one would send, so it is mirrored
// up rather than read back out of the store.
watch(batch, (value) => emit('update:batch', value), { immediate: true, deep: true })

// The server refuses all of these too, so this is not a second set of rules — it avoids a round
// trip, and a decrypt's worth of audit trail, on a request already known to fail.
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

// A row states its own problem, under the field it belongs to. `batchProblem` decides whether
// anything is missing; its sentence is never rendered, because it names no key.
function addNameProblem(row: { id: number; key: string }) {
  if (!shown[addedRowId(row)]) return ''
  const key = row.key.trim()
  if (key === '') return 'This new key needs a name.'
  if ((props.detail.keys || []).includes(key)) return `This Secret already has a key named ${key}.`
  if (added.value.filter((other) => other.key.trim() === key).length > 1) return 'Two new keys share this name.'
  return ''
}

function addValueProblem(row: { id: number; key: string; value: string }) {
  if (!shown[addedRowId(row)]) return ''
  return addNameProblem(row) === '' && row.value === '' ? 'This new key needs a value.' : ''
}

const addProblem = (row: { id: number; key: string; value: string }) => addNameProblem(row) || addValueProblem(row)

function existingProblem(key: string) {
  if (!shown[stagedRowId(key)]) return ''
  return operationOf(key) !== 'delete' && !(replacements[key] || '') ? 'This change needs a value.' : ''
}

// Pressing review on an incomplete batch is the operator asking what is missing: every row says
// so at once, and the cursor lands on the first field to fix. The surface calls this before it
// sends anything.
function showProblems() {
  openKeys.value.forEach((key) => { shown[stagedRowId(key)] = true })
  added.value.forEach((row) => { shown[addedRowId(row)] = true })
}

defineExpose({ batchProblem, showProblems, clear })
</script>

<template>
  <div class="flex flex-col">
    <AppAlert v-if="!canReveal" type="info" title="Values concealed" class="my-3">
      <p class="m-0 max-w-[62ch] text-[13px] text-muted">
        You can inspect encrypted key names, but this namespace does not grant reveal access.
      </p>
    </AppAlert>
    <AppAlert v-if="error" type="error" title="Operation failed" closable class="my-3" @close="error = ''">
      <p class="m-0 max-w-[62ch] text-[13px] text-muted">{{ error }}</p>
    </AppAlert>

    <ul class="m-0 list-none p-0">
      <li
        v-for="key in props.detail.keys || []"
        :key="key"
        :ref="(element: unknown) => setRow(key, element)"
        class="grid grid-cols-[minmax(0,17rem)_minmax(0,1fr)_auto] items-center gap-x-5 border-b border-l-2 border-border py-2 pr-3.5 pl-[15px] transition-colors duration-[110ms] hover:bg-surface"
        :class="editing[key] ? 'border-l-accent bg-surface' : 'border-l-transparent'"
        @focusout="leave(stagedRowId(key), $event)"
      >
        <span class="truncate font-mono text-[13.5px] font-[550] text-ink">{{ key }}</span>

        <span class="min-w-0">
          <input
            v-if="hasRevealed(key)"
            readonly
            type="text"
            :value="revealed[key]"
            :aria-label="`Revealed value for ${key}`"
            class="inline-block max-w-full truncate rounded-mini border border-border-strong bg-surface-raised px-2.5 py-1 font-mono text-[12.5px] text-ink"
          />
          <span
            v-else
            aria-hidden="true"
            class="font-mono text-[13px] tracking-[0.14em] text-faint select-none"
            :class="editing[key] && operationOf(key) === 'delete' ? 'line-through opacity-55' : ''"
          >{{ DOTS }}</span>
        </span>

        <!-- The value's own controls, in the row they act on. Under drift the row keeps its dots
             and loses every button: a control that cannot act is worse than no control. -->
        <span class="flex items-center gap-[3px]">
          <button
            v-if="canRevealValue && !hasRevealed(key)"
            type="button"
            :disabled="!!activeKey"
            :aria-label="`Reveal ${key}`"
            class="inline-flex h-[27px] cursor-pointer items-center gap-[5px] rounded-mini border border-transparent bg-transparent px-2.5 text-xs font-semibold whitespace-nowrap text-accent hover:border-border-strong hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-50"
            @click="reveal(key)"
          >
            <AppIcon name="eye" :size="13" />Reveal
          </button>
          <button
            v-if="hasRevealed(key)"
            type="button"
            :aria-label="`Conceal ${key}`"
            class="inline-flex h-[27px] cursor-pointer items-center gap-[5px] rounded-mini border border-transparent bg-transparent px-2.5 text-xs font-semibold whitespace-nowrap text-accent hover:border-border-strong hover:bg-surface-raised"
            @click="conceal(key)"
          >
            <AppIcon name="eye-off" :size="13" />Conceal
          </button>

          <!-- One control both ways: it opens the row's staged change and closes it again,
               discarding what was staged. It stays openable while `canPatch` is false only to
               close a row drift appeared under. -->
          <button
            v-if="(canPatch && !hasRevealed(key)) || editing[key]"
            type="button"
            :aria-label="editing[key] ? `Discard the staged change to ${key}` : `Change ${key}`"
            :aria-expanded="editing[key]"
            :aria-controls="`staged-${key}`"
            class="inline-flex h-[27px] cursor-pointer items-center gap-[5px] rounded-mini border border-transparent bg-transparent px-2.5 text-xs font-semibold whitespace-nowrap text-muted hover:border-border-strong hover:bg-surface-raised hover:text-ink"
            @click="editing[key] ? clear(key) : startEdit(key)"
          >{{ editing[key] ? 'Discard' : 'Change' }}</button>
          <button
            v-if="canPatch && !editing[key] && !hasRevealed(key)"
            type="button"
            :aria-label="`Remove ${key}`"
            class="inline-flex h-[27px] cursor-pointer items-center gap-[5px] rounded-mini border border-transparent bg-transparent px-2.5 text-xs font-semibold whitespace-nowrap text-muted hover:border-border-strong hover:bg-surface-raised hover:text-ink"
            @click="removeKey(key)"
          >Remove</button>
        </span>

        <!-- The change opens inside the row it belongs to, indented under the key it acts on. -->
        <div
          v-if="editing[key]"
          :id="`staged-${key}`"
          class="col-span-full mt-2.5 flex flex-col gap-[11px] rounded-[10px] border border-accent/45 bg-accent/8 px-[13px] py-3"
        >
          <AppRadioGroup
            :model-value="operationOf(key)"
            :name="`operation-${key}`"
            :options="EXISTING_OPERATIONS"
            :ariaLabel="`Operation for ${key}`"
            :disabled="!canPatch"
            @update:model-value="setOperation(key, $event)"
          />

          <input
            v-if="operationOf(key) !== 'delete'"
            :id="`staged-input-${key}`"
            v-model="replacements[key]"
            type="text"
            :aria-label="`Replacement value for ${key}`"
            :aria-invalid="existingProblem(key) ? 'true' : undefined"
            :aria-describedby="existingProblem(key) ? `staged-problem-${key}` : undefined"
            placeholder="New value"
            autocomplete="off"
            spellcheck="false"
            class="h-8 w-full rounded-[8px] border border-border-strong bg-bg px-2.5 font-mono text-[13px] text-ink placeholder:font-sans placeholder:text-faint"
          />

          <p v-if="existingProblem(key)" :id="`staged-problem-${key}`" class="m-0 text-[13px] text-danger">{{ existingProblem(key) }}</p>
        </div>
      </li>

      <li
        v-for="(row, index) in added"
        :key="row.id"
        class="grid grid-cols-[minmax(0,17rem)_minmax(0,1fr)_auto] items-center gap-x-5 border-b border-l-2 border-border py-2 pr-3.5 pl-[15px]"
        :class="'border-l-transparent'"
        @focusout="leave(addedRowId(row), $event)"
      >
        <input
          :ref="(element: unknown) => setAddInput(row.id, element)"
          v-model="row.key"
          type="text"
          :aria-label="`New key name ${index + 1}`"
          :aria-invalid="addNameProblem(row) ? 'true' : undefined"
          :aria-describedby="addNameProblem(row) ? `new-problem-${row.id}` : undefined"
          placeholder="Key name"
          autocomplete="off"
          spellcheck="false"
          class="w-full rounded-mini border border-border-strong bg-bg px-2.5 py-1 font-mono text-[13.5px] text-ink placeholder:font-sans placeholder:text-faint"
        />
        <input
          v-model="row.value"
          type="text"
          :aria-label="`New key value ${index + 1}`"
          :aria-invalid="addValueProblem(row) ? 'true' : undefined"
          :aria-describedby="addValueProblem(row) ? `new-problem-${row.id}` : undefined"
          placeholder="Value"
          autocomplete="off"
          spellcheck="false"
          class="h-8 w-full rounded-[8px] border border-border-strong bg-bg px-2.5 font-mono text-[13px] text-ink placeholder:font-sans placeholder:text-faint"
        />
        <span class="flex items-center gap-[3px]">
          <button
            type="button"
            :aria-label="`Remove new key ${index + 1}`"
            class="inline-flex h-[27px] cursor-pointer items-center gap-[5px] rounded-mini border border-transparent bg-transparent px-2.5 text-xs font-semibold whitespace-nowrap text-muted hover:border-border-strong hover:bg-surface-raised hover:text-ink"
            @click="removeAdded(index)"
          ><AppIcon name="x" :size="13" />Discard</button>
        </span>
        <p v-if="addProblem(row)" :id="`new-problem-${row.id}`" class="col-span-full mt-1.5 mb-0 text-[13px] text-danger">{{ addProblem(row) }}</p>
      </li>
    </ul>

    <!-- The ledger's last line: a key that is not here yet is added where the others are. -->
    <button
      v-if="canPatch"
      type="button"
      class="flex w-full cursor-pointer items-center gap-[7px] border-0 border-b border-border bg-transparent px-[15px] py-[11px] text-left text-[12.5px] font-semibold text-muted hover:bg-surface hover:text-accent"
      @click="addRow"
    >
      <AppIcon name="plus" :size="13" />
      Add a key
    </button>
  </div>
</template>
