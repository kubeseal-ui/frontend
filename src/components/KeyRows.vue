<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppRadioGroup from '@/components/ui/AppRadioGroup.vue'
import AppSecretInput from '@/components/ui/AppSecretInput.vue'
import AppTag from '@/components/ui/AppTag.vue'
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
const canPatch = computed(() => auth.hasCapability(namespace.value, 'secret:seal') && canReveal.value && props.detail.git.in_sync_with_live)
// The commit every reveal and review is made against. Absent means the server did not report
// one, which the controls that need it refuse rather than send.
const baseCommit = computed(() => props.detail.git.base_commit || '')

// An add over a key that is present is refused by the API, so it is not offered.
const EXISTING_OPERATIONS = [
  { label: 'Replace', value: 'replace' },
  { label: 'Delete', value: 'delete' },
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
  if (!canReveal.value || !baseCommit.value) return
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
  rows.value[key]?.querySelector<HTMLInputElement>('input[type="password"]')?.focus()
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
    <AppAlert v-if="!props.detail.git.in_sync_with_live" type="warning" title="Editing disabled" class="mb-3">
      Git and live state differ. Resolve drift before revealing or editing values.
    </AppAlert>
    <AppAlert v-if="!canReveal" type="info" title="Values concealed" class="mb-3">
      You can inspect encrypted key names, but this namespace does not grant reveal access.
    </AppAlert>
    <AppAlert v-if="error" type="error" title="Operation failed" closable class="mb-3" @close="error = ''">{{ error }}</AppAlert>

    <ul class="m-0 flex list-none flex-col p-0">
      <li
        v-for="key in props.detail.keys || []"
        :key="key"
        :ref="(element: unknown) => setRow(key, element)"
        class="border-t border-border py-3 first:border-t-0"
        @focusout="leave(stagedRowId(key), $event)"
      >
        <div class="flex flex-wrap items-center gap-2">
          <code class="font-mono text-sm">{{ key }}</code>
          <AppTag v-if="editing[key]" tone="accent">{{ operationOf(key) }}</AppTag>
          <AppTag v-else-if="hasRevealed(key)">revealed</AppTag>
          <AppTag v-else>concealed</AppTag>

          <div class="ml-auto flex flex-wrap items-center gap-2">
            <AppSecretInput v-if="hasRevealed(key)" v-model="revealed[key]" readonly :ariaLabel="`Revealed value for ${key}`" />
            <AppButton v-if="canReveal && !hasRevealed(key)" icon="eye" :disabled="!!activeKey" @click="reveal(key)">Reveal one key</AppButton>
            <AppButton v-if="hasRevealed(key)" icon="eye-off" :aria-label="`Conceal ${key}`" @click="conceal(key)">Conceal</AppButton>
            <!-- One control both ways: it opens the row's staged change and closes it again,
                 discarding what was staged. A button that disappeared on press would leave the
                 expansion unannounced, so this one stays and carries the state. -->
            <AppButton
              v-if="canReveal"
              :icon="editing[key] ? 'trash' : 'pencil'"
              :aria-label="editing[key] ? `Discard the staged change to ${key}` : `Change ${key}`"
              :aria-expanded="editing[key]"
              :aria-controls="`staged-${key}`"
              @click="editing[key] ? clear(key) : startEdit(key)"
            >{{ editing[key] ? 'Discard' : 'Change' }}</AppButton>
            <AppButton v-if="canReveal && !editing[key]" variant="ghost" icon="trash" :aria-label="`Remove ${key}`" @click="removeKey(key)">Remove</AppButton>
          </div>
        </div>

        <div v-if="editing[key]" :id="`staged-${key}`" class="mt-3 flex flex-col gap-2 rounded-card-inner border border-accent/40 bg-accent/5 p-3">
          <AppRadioGroup
            :model-value="operationOf(key)"
            :name="`operation-${key}`"
            :options="EXISTING_OPERATIONS"
            :ariaLabel="`Operation for ${key}`"
            :disabled="!canPatch"
            @update:model-value="setOperation(key, $event)"
          />

          <AppSecretInput
            v-if="operationOf(key) !== 'delete'"
            v-model="replacements[key]"
            placeholder="Replacement value"
            :ariaLabel="`Replacement value for ${key}`"
            :invalid="!!existingProblem(key)"
            :describedBy="existingProblem(key) ? `staged-problem-${key}` : ''"
          />
          <p v-else class="m-0 text-sm text-muted">Deletes the key; no value is needed.</p>

          <p v-if="existingProblem(key)" :id="`staged-problem-${key}`" class="m-0 text-sm text-danger">{{ existingProblem(key) }}</p>
        </div>
      </li>

      <li
        v-for="(row, index) in added"
        :key="row.id"
        class="border-t border-border py-3"
        @focusout="leave(addedRowId(row), $event)"
      >
        <div class="flex flex-wrap items-center gap-2.5">
          <AppTag tone="accent">add</AppTag>
          <input
            :ref="(element: unknown) => setAddInput(row.id, element)"
            v-model="row.key"
            :aria-label="`New key name ${index + 1}`"
            :aria-invalid="addNameProblem(row) ? 'true' : undefined"
            :aria-describedby="addNameProblem(row) ? `new-problem-${row.id}` : undefined"
            placeholder="Key name"
            class="field min-w-0 flex-1 font-mono"
          />
          <AppSecretInput
            v-model="row.value"
            class="min-w-0 flex-1"
            placeholder="Value"
            :ariaLabel="`New key value ${index + 1}`"
            :invalid="!!addValueProblem(row)"
            :describedBy="addValueProblem(row) ? `new-problem-${row.id}` : ''"
          />
          <AppButton
            size="small"
            variant="ghost"
            icon="x"
            :aria-label="`Remove new key ${index + 1}`"
            @click="removeAdded(index)"
          />
        </div>
        <p v-if="addProblem(row)" :id="`new-problem-${row.id}`" class="mt-2 mb-0 text-sm text-danger">{{ addProblem(row) }}</p>
      </li>
    </ul>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <AppButton v-if="canPatch" icon="plus" @click="addRow">Add key</AppButton>
      <AppButton v-if="batch.length > 0" variant="ghost" class="ml-auto" @click="clear()">Discard all</AppButton>
    </div>
  </div>
</template>
