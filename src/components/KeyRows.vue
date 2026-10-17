<script setup lang="ts">
import { computed, nextTick, onUnmounted, reactive, ref, watch } from 'vue'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppRadioGroup from '@/components/ui/AppRadioGroup.vue'
import { describeError } from '@/api'
import { keyNameProblem } from '@/utils/validation'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import type { Mutation, MutationOperation, SealedSecretDetail } from '@/types'

// Every staged change lands in one diff and one commit; each key keeps its own Reveal — one decrypt, one audit event.
const props = defineProps<{ detail: SealedSecretDetail }>()
const emit = defineEmits<{ 'update:batch': [Mutation[]] }>()

const auth = useAuthStore()
const store = useSecretsStore()
const revealed = reactive<Record<string, string>>({})
const replacements = reactive<Record<string, string>>({})
const operation = reactive<Record<string, MutationOperation>>({})
/** Keys whose row is open for editing; the change is staged inside the row rather than in a tray below. */
const editing = reactive<Record<string, boolean>>({})
/** Value fields showing what was typed rather than dots; this is not the row's Reveal, so it asks no capability. */
const peek = reactive<Record<string, boolean>>({})
/** Value fields opened out into a multi-line box: HTML strips newlines from `type=text`/`type=password`, so a pasted key would arrive silently joined; nothing here guesses which values need it. */
const multiline = reactive<Record<string, boolean>>({})
// `-webkit-text-security` is the only mask for a non-`type=password` field and is WebKit/Blink-only; where it is missing the box simply offers no eye.
const canConceal = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('-webkit-text-security', 'disc')
/** The mask is for a value, not the field: an empty box rendered as dots reads as one that already holds something. */
const concealed = (id: string, value: string | undefined) => Boolean(multiline[id]) && canConceal && !peek[id] && Boolean(value)
/** The field opened to fill the screen; the closures edit the same string the row holds, and a null `set` is read-only (a revealed value). */
const fullscreen = ref<{ id: string; label: string; get: () => string; set: ((value: string) => void) | null } | null>(null)
const fullscreenValue = computed({
  get: () => fullscreen.value?.get() ?? '',
  set: (value: string) => { fullscreen.value?.set?.(value) },
})
const overlay = ref<HTMLElement | null>(null)
const fullscreenInput = ref<HTMLTextAreaElement | null>(null)
let fullscreenReturn: HTMLElement | null = null

async function openFullscreen(id: string, label: string, get: () => string, set: ((value: string) => void) | null) {
  fullscreenReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null
  fullscreen.value = { id, label, get, set }
  await nextTick()
  fullscreenInput.value?.focus()
}

// Focus returns to the control that opened the field; a row discarded while it held the screen leaves nowhere to return to.
function closeFullscreen() {
  fullscreen.value = null
  fullscreenReturn?.focus()
  fullscreenReturn = null
}

// Tab wraps inside the overlay: the page behind it is not reachable while the field holds the screen.
function trapTab(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !overlay.value) return
  const focusable = Array.from(overlay.value.querySelectorAll<HTMLElement>('button, textarea'))
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) { last.focus(); event.preventDefault() }
  else if (!event.shiftKey && document.activeElement === last) { first.focus(); event.preventDefault() }
}

// A route change unmounts this component without the watcher firing again, so the lock is released here too.
watch(fullscreen, (open) => { document.body.style.overflow = open ? 'hidden' : '' })
onUnmounted(() => { document.body.style.overflow = '' })

const added = ref<{ id: number; key: string; value: string }[]>([])
const activeKey = ref('')
const error = ref('')
const addInputs = ref<Record<number, HTMLInputElement | null>>({})
const addButton = ref<HTMLButtonElement | null>(null)
const rows = ref<Record<string, HTMLLIElement | null>>({})
const revealButtons = ref<Record<string, HTMLButtonElement | null>>({})

const namespace = computed(() => props.detail.namespace)
const canReveal = computed(() => auth.hasCapability(namespace.value, 'secret:decrypt'))
// The server answers 409 while Git and the cluster differ, so these controls are withheld; concealing stays ungated — it sends nothing.
const canRevealValue = computed(() => canReveal.value && props.detail.git.in_sync_with_live)
const canPatch = computed(() => auth.hasCapability(namespace.value, 'secret:seal') && props.detail.git.in_sync_with_live)
// The commit every reveal and review is made against; absent means the controls that need it refuse rather than send.
const baseCommit = computed(() => props.detail.git.base_commit || '')

// The twelve dots the product is: a value that is there and cannot be read, until one key is asked for.
const DOTS = '••••••••••••'

// An add over a key that is present is refused by the API, so it is not offered.
const EXISTING_OPERATIONS = [
  { label: 'Replace the value', value: 'replace' },
  { label: 'Delete the key', value: 'delete' },
]

let nextRowId = 0

// Which rows have been left: a field that turns red the moment it appears reads as a fault rather than a prompt.
const shown = reactive<Record<string, boolean>>({})
const stagedRowId = (key: string) => `key-${key}`
const addedRowId = (row: { id: number }) => `add-${row.id}`
const revealRowId = (key: string) => `reveal-${key}`

// Leaving the row turns its problems on; moving between the row's own fields is not leaving it.
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
async function conceal(key: string) {
  if (fullscreen.value?.id === revealRowId(key)) fullscreen.value = null
  delete revealed[key]
  // Conceal is unmounted by its own press, so focus moves to the Reveal that replaces it rather than falling to the body.
  await nextTick()
  revealButtons.value[key]?.focus()
}
const setRevealButton = (key: string, element: unknown) => { revealButtons.value[key] = element instanceof HTMLButtonElement ? element : null }

// Focus follows the row just opened: Change is gone by the time it is pressed, so without this focus falls to the body.
async function startEdit(key: string) {
  editing[key] = true
  operation[key] = operationOf(key)
  await nextTick()
  rows.value[key]?.querySelector<HTMLInputElement>(`#staged-input-${CSS.escape(key)}`)?.focus()
}

// A removal is a delete of a key that is here, stated outright rather than as a mode of Change; focus follows the option it staged.
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

// Discard sits inside the row it removes, so focus must be carried out of it — to the next row, or to Add when that was the last.
async function removeAdded(index: number) {
  const [row] = added.value.splice(index, 1)
  if (row) {
    if (fullscreen.value?.id === addedRowId(row)) fullscreen.value = null
    delete shown[addedRowId(row)]; delete peek[addedRowId(row)]; delete multiline[addedRowId(row)]
  }
  await nextTick()
  const next = added.value[index] ?? added.value[added.value.length - 1]
  const input = next ? addInputs.value[next.id] : null
  if (input) input.focus()
  else addButton.value?.focus()
}

const setAddInput = (id: number, element: unknown) => { addInputs.value[id] = element instanceof HTMLInputElement ? element : null }
const setRow = (key: string, element: unknown) => { rows.value[key] = element instanceof HTMLLIElement ? element : null }

function clear(key?: string) {
  if (key) {
    if (fullscreen.value?.id === stagedRowId(key) || fullscreen.value?.id === revealRowId(key)) fullscreen.value = null
    delete revealed[key]; delete replacements[key]; delete operation[key]; delete editing[key]
    delete shown[stagedRowId(key)]; delete peek[stagedRowId(key)]; delete multiline[stagedRowId(key)]
  } else {
    fullscreen.value = null
    for (const bag of [revealed, replacements, operation, editing, shown, peek, multiline]) {
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

// The surface owns the presses and needs the batch, so it is mirrored up rather than read back out of the store.
watch(batch, (value) => emit('update:batch', value), { immediate: true, deep: true })

// The server refuses this with a 400 after decrypting, so it is caught here; net count, since a delete paired with an add is fine.
const emptiesSecret = computed(() => {
  const current = (props.detail.keys || []).length
  if (current === 0) return false
  let deletes = 0
  for (const key of props.detail.keys || []) {
    if (editing[key] && operationOf(key) === 'delete') deletes++
  }
  const adds = added.value.filter((row) => row.key.trim() !== '').length
  return current - deletes + adds < 1
})

// The server refuses these too — this only avoids a round trip and a decrypt's audit trail on a request known to fail.
const batchProblem = computed(() => {
  if (batch.value.length === 0) return ''
  if (batch.value.some((entry) => entry.key === '')) return 'Every key being added needs a name.'
  if (batch.value.some((entry) => entry.operation !== 'delete' && entry.value === '')) return 'Every key being changed needs a value.'
  if (emptiesSecret.value) return 'A Secret must keep at least one key; this change would remove the last one.'
  const taken = new Set(props.detail.keys || [])
  const collisions = new Set<string>()
  for (const row of added.value) {
    const key = row.key.trim()
    if (key === '') continue
    if (taken.has(key)) collisions.add(key)
    taken.add(key)
  }
  if (collisions.size > 0) return `Every new key needs a name the Secret does not already use: ${[...collisions].join(', ')}.`
  const invalid = new Set<string>()
  for (const row of added.value) {
    if (keyNameProblem(row.key.trim()) !== '') invalid.add(row.key.trim())
  }
  if (invalid.size > 0) return `Some new key names Kubernetes refuses: ${[...invalid].join(', ')}.`
  return ''
})

// A row states its own problem under its own field; `batchProblem` decides whether anything is missing and names no key.
function addNameProblem(row: { id: number; key: string }) {
  if (!shown[addedRowId(row)]) return ''
  const key = row.key.trim()
  if (key === '') return 'This new key needs a name.'
  if ((props.detail.keys || []).includes(key)) return `This Secret already has a key named ${key}.`
  if (added.value.filter((other) => other.key.trim() === key).length > 1) return 'Two new keys share this name.'
  return keyNameProblem(key)
}

function addValueProblem(row: { id: number; key: string; value: string }) {
  if (!shown[addedRowId(row)]) return ''
  return addNameProblem(row) === '' && row.value === '' ? 'This new key needs a value.' : ''
}

const addProblem = (row: { id: number; key: string; value: string }) => addNameProblem(row) || addValueProblem(row)

function existingProblem(key: string) {
  if (!shown[stagedRowId(key)]) return ''
  if (operationOf(key) === 'delete') {
    // A delete that empties the Secret is the only problem a delete row can state: it has no value
    // field to be short. The message points at the way out — add a key — rather than just refusing.
    return emptiesSecret.value ? 'A Secret must keep at least one key. Add a key before removing the last one.' : ''
  }
  return !(replacements[key] || '') ? 'This change needs a value.' : ''
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
        class="grid grid-cols-[minmax(0,17rem)_minmax(0,1fr)_auto] max-sm:grid-cols-1 max-sm:gap-y-2 items-center gap-x-5 border-b border-l-2 border-border py-2 pr-[15px] pl-[13px] transition-colors duration-[110ms] hover:bg-surface"
        :class="editing[key] ? 'border-l-accent bg-surface' : 'border-l-transparent'"
        @focusout="leave(stagedRowId(key), $event)"
      >
        <span class="truncate font-mono text-[13.5px] font-[550] text-ink">{{ key }}</span>

        <span class="relative min-w-0">
          <!-- A revealed value wraps and scrolls rather than truncating, and is focusable so a keyboard user can scroll it. -->
          <div
            v-if="hasRevealed(key)"
            role="textbox"
            aria-readonly="true"
            tabindex="0"
            :aria-label="`Revealed value for ${key}`"
            class="reveal-in block max-h-32 w-full overflow-auto rounded-mini border border-border-strong bg-surface-raised py-1 pr-9 max-sm:pr-10 pl-2.5 font-mono text-[12.5px] leading-relaxed break-all whitespace-pre-wrap text-ink select-all"
          >{{ revealed[key] }}</div>
          <!-- The same plaintext the row holds opens to the screen; read-only, since a reveal has no string to write back to. -->
          <button
            v-if="hasRevealed(key)"
            type="button"
            :aria-label="`Open the revealed value for ${key} in a full-screen field`"
            class="absolute top-1 right-1 inline-flex size-6 max-sm:size-9 cursor-pointer items-center justify-center rounded-mini border-0 bg-transparent text-faint hover:text-ink"
            @click="openFullscreen(revealRowId(key), `Revealed value for ${key}`, () => revealed[key] ?? '', null)"
          ><AppIcon name="expand" :size="13" /></button>
          <!-- Announced, because the press that started it is disabled while it runs. -->
          <span
            v-else-if="activeKey === key"
            role="status"
            class="inline-flex items-center gap-1.5 text-[12.5px] text-muted"
          >
            <span class="spin" aria-hidden="true" />Decrypting
          </span>
          <span
            v-else
            aria-hidden="true"
            class="font-mono text-[13px] tracking-[0.14em] text-faint select-none"
            :class="editing[key] && operationOf(key) === 'delete' ? 'line-through opacity-55' : ''"
          >{{ DOTS }}</span>
          <!-- The accent edge that crosses the slot with the wipe; decorative. -->
          <span v-if="hasRevealed(key)" class="sweep" aria-hidden="true" />
        </span>

        <!-- Under drift the row keeps its dots and loses every button; the negative edges cancel the end buttons' own `px-2.5`. -->
        <span class="flex items-center gap-[3px] -mr-2.5 max-sm:-ml-2.5">
          <button
            v-if="canRevealValue && !hasRevealed(key)"
            :ref="(el) => setRevealButton(key, el)"
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

          <!-- One control both ways, offered alongside Reveal/Conceal; stays openable while `canPatch` is false only to close a row drift appeared under. -->
          <button
            v-if="canPatch || editing[key]"
            type="button"
            :aria-label="editing[key] ? `Discard the staged change to ${key}` : `Change ${key}`"
            :aria-expanded="editing[key]"
            :aria-controls="`staged-${key}`"
            class="inline-flex h-[27px] cursor-pointer items-center gap-[5px] rounded-mini border border-transparent bg-transparent px-2.5 text-xs font-semibold whitespace-nowrap text-muted hover:border-border-strong hover:bg-surface-raised hover:text-ink"
            @click="editing[key] ? clear(key) : startEdit(key)"
          ><AppIcon :name="editing[key] ? 'x' : 'pencil'" :size="13" />{{ editing[key] ? 'Discard' : 'Change' }}</button>
          <!-- The one action here that pressing it again does not undo, so it carries danger rather than the neutral tone. -->
          <button
            v-if="canPatch && !editing[key]"
            type="button"
            :aria-label="`Remove ${key}`"
            class="inline-flex h-[27px] cursor-pointer items-center gap-[5px] rounded-mini border border-transparent bg-transparent px-2.5 text-xs font-semibold whitespace-nowrap text-danger hover:border-danger/40 hover:bg-danger/10"
            @click="removeKey(key)"
          ><AppIcon name="trash" :size="13" />Remove</button>
        </span>

        <!-- The change opens inside its row; the fold is one-way so a form holding a password field is never left mounted at zero height. -->
        <div class="fold col-span-full" :class="{ open: editing[key] }">
          <div>
            <div
              v-if="editing[key]"
              :id="`staged-${key}`"
              class="mt-2.5 flex flex-col gap-[11px] rounded-[10px] border border-accent/45 bg-accent/8 px-[13px] py-3"
            >
              <AppRadioGroup
                :model-value="operationOf(key)"
                :name="`operation-${key}`"
                :options="EXISTING_OPERATIONS"
                :ariaLabel="`Operation for ${key}`"
                :disabled="!canPatch"
                @update:model-value="setOperation(key, $event)"
              />

              <span v-if="operationOf(key) !== 'delete'" class="relative block">
                <!-- The same field opened out; the mask is CSS here because a textarea has no `type=password`. -->
                <textarea
                  v-if="multiline[stagedRowId(key)]"
                  :id="`staged-input-${key}`"
                  v-model="replacements[key]"
                  rows="4"
                  :aria-label="`Replacement value for ${key}`"
                  :aria-invalid="existingProblem(key) ? 'true' : undefined"
                  :aria-describedby="existingProblem(key) ? `staged-problem-${key}` : undefined"
                  placeholder="New value"
                  autocomplete="off"
                  spellcheck="false"
                  :class="concealed(stagedRowId(key), replacements[key]) ? 'conceal' : ''"
                  class="block max-h-40 w-full overflow-auto rounded-[8px] border border-border-strong bg-bg py-1 pr-[86px] pl-2.5 max-sm:pr-[98px] font-mono text-[13px] max-sm:text-[14px] leading-relaxed text-ink placeholder:font-sans placeholder:text-faint"
                />
                <input
                  v-else
                  :id="`staged-input-${key}`"
                  v-model="replacements[key]"
                  :type="peek[stagedRowId(key)] ? 'text' : 'password'"
                  :aria-label="`Replacement value for ${key}`"
                  :aria-invalid="existingProblem(key) ? 'true' : undefined"
                  :aria-describedby="existingProblem(key) ? `staged-problem-${key}` : undefined"
                  placeholder="New value"
                  autocomplete="off"
                  spellcheck="false"
                  class="h-8 w-full rounded-[8px] border border-border-strong bg-bg py-0 pr-[62px] pl-2.5 max-sm:pr-[74px] font-mono text-[13px] max-sm:text-[14px] text-ink placeholder:font-sans placeholder:text-faint"
                />
                <!-- In the opened box the controls line up along the top edge; the one-line input keeps its centred pair. -->
                <button
                  type="button"
                  :aria-label="multiline[stagedRowId(key)] ? `Use a one-line field for ${key}` : `Use a multi-line field for ${key}`"
                  :aria-pressed="!!multiline[stagedRowId(key)]"
                  :class="multiline[stagedRowId(key)] ? 'top-1.5' : 'top-1/2 -translate-y-1/2'"
                  class="absolute right-[34px] inline-flex size-6 max-sm:size-9 cursor-pointer items-center justify-center rounded-mini border-0 bg-transparent text-faint hover:text-ink"
                  @click="multiline[stagedRowId(key)] = !multiline[stagedRowId(key)]"
                ><AppIcon name="lines" :size="13" /></button>
                <button
                  v-if="multiline[stagedRowId(key)]"
                  type="button"
                  :aria-label="`Open the replacement value for ${key} in a full-screen field`"
                  class="absolute top-1.5 right-[62px] inline-flex size-6 max-sm:size-9 cursor-pointer items-center justify-center rounded-mini border-0 bg-transparent text-faint hover:text-ink"
                  @click="openFullscreen(stagedRowId(key), `Replacement value for ${key}`, () => replacements[key] ?? '', (value) => { replacements[key] = value })"
                ><AppIcon name="expand" :size="13" /></button>
                <button
                  v-if="!multiline[stagedRowId(key)] || canConceal"
                  type="button"
                  :aria-label="peek[stagedRowId(key)] ? `Hide the replacement value for ${key}` : `Show the replacement value for ${key}`"
                  :aria-pressed="!!peek[stagedRowId(key)]"
                  :class="multiline[stagedRowId(key)] ? 'top-1.5' : 'top-1/2 -translate-y-1/2'"
                  class="absolute right-1.5 inline-flex size-6 max-sm:size-9 cursor-pointer items-center justify-center rounded-mini border-0 bg-transparent text-faint hover:text-ink"
                  @click="peek[stagedRowId(key)] = !peek[stagedRowId(key)]"
                ><AppIcon :name="peek[stagedRowId(key)] ? 'eye-off' : 'eye'" :size="13" /></button>
              </span>

              <p v-if="existingProblem(key)" :id="`staged-problem-${key}`" class="m-0 text-[13px] text-danger">{{ existingProblem(key) }}</p>
            </div>
          </div>
        </div>
      </li>

      <li
        v-for="(row, index) in added"
        :key="row.id"
        class="grid grid-cols-[minmax(0,17rem)_minmax(0,1fr)_auto] max-sm:grid-cols-1 max-sm:gap-y-2 items-center gap-x-5 border-b border-l-2 border-border py-2 pr-[15px] pl-[13px]"
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
          class="w-full rounded-mini border border-border-strong bg-bg px-2.5 py-1 font-mono text-[13.5px] max-sm:text-[14px] text-ink placeholder:font-sans placeholder:text-faint"
        />
        <span class="relative block">
          <textarea
            v-if="multiline[addedRowId(row)]"
            v-model="row.value"
            rows="4"
            :aria-label="`New key value ${index + 1}`"
            :aria-invalid="addValueProblem(row) ? 'true' : undefined"
            :aria-describedby="addValueProblem(row) ? `new-problem-${row.id}` : undefined"
            placeholder="Value"
            autocomplete="off"
            spellcheck="false"
            :class="concealed(addedRowId(row), row.value) ? 'conceal' : ''"
            class="block max-h-40 w-full overflow-auto rounded-[8px] border border-border-strong bg-bg py-1 pr-[86px] pl-2.5 max-sm:pr-[98px] font-mono text-[13px] max-sm:text-[14px] leading-relaxed text-ink placeholder:font-sans placeholder:text-faint"
          />
          <input
            v-else
            v-model="row.value"
            :type="peek[addedRowId(row)] ? 'text' : 'password'"
            :aria-label="`New key value ${index + 1}`"
            :aria-invalid="addValueProblem(row) ? 'true' : undefined"
            :aria-describedby="addValueProblem(row) ? `new-problem-${row.id}` : undefined"
            placeholder="Value"
            autocomplete="off"
            spellcheck="false"
            class="h-8 w-full rounded-[8px] border border-border-strong bg-bg py-0 pr-[62px] pl-2.5 max-sm:pr-[74px] font-mono text-[13px] max-sm:text-[14px] text-ink placeholder:font-sans placeholder:text-faint"
          />
          <button
            type="button"
            :aria-label="multiline[addedRowId(row)] ? `Use a one-line field for new key ${index + 1}` : `Use a multi-line field for new key ${index + 1}`"
            :aria-pressed="!!multiline[addedRowId(row)]"
            :class="multiline[addedRowId(row)] ? 'top-1.5' : 'top-1/2 -translate-y-1/2'"
            class="absolute right-[34px] inline-flex size-6 max-sm:size-9 cursor-pointer items-center justify-center rounded-mini border-0 bg-transparent text-faint hover:text-ink"
            @click="multiline[addedRowId(row)] = !multiline[addedRowId(row)]"
          ><AppIcon name="lines" :size="13" /></button>
          <button
            v-if="multiline[addedRowId(row)]"
            type="button"
            :aria-label="`Open the new key value ${index + 1} in a full-screen field`"
            class="absolute top-1.5 right-[62px] inline-flex size-6 max-sm:size-9 cursor-pointer items-center justify-center rounded-mini border-0 bg-transparent text-faint hover:text-ink"
            @click="openFullscreen(addedRowId(row), `New key value ${index + 1}`, () => row.value, (value) => { row.value = value })"
          ><AppIcon name="expand" :size="13" /></button>
          <button
            v-if="!multiline[addedRowId(row)] || canConceal"
            type="button"
            :aria-label="peek[addedRowId(row)] ? `Hide the new key value ${index + 1}` : `Show the new key value ${index + 1}`"
            :aria-pressed="!!peek[addedRowId(row)]"
            :class="multiline[addedRowId(row)] ? 'top-1.5' : 'top-1/2 -translate-y-1/2'"
            class="absolute right-1.5 inline-flex size-6 max-sm:size-9 cursor-pointer items-center justify-center rounded-mini border-0 bg-transparent text-faint hover:text-ink"
            @click="peek[addedRowId(row)] = !peek[addedRowId(row)]"
          ><AppIcon :name="peek[addedRowId(row)] ? 'eye-off' : 'eye'" :size="13" /></button>
        </span>
        <span class="flex items-center gap-[3px] -mr-2.5 max-sm:-ml-2.5">
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
      ref="addButton"
      type="button"
      class="flex w-full cursor-pointer items-center gap-[7px] border-0 border-b border-border bg-transparent px-[15px] py-[11px] text-left text-[12.5px] font-semibold text-muted hover:bg-surface hover:text-accent"
      @click="addRow"
    >
      <AppIcon name="plus" :size="13" />
      Add a key
    </button>

    <!-- The same field with the screen to itself; closing hands focus back to the control that opened it. -->
    <Teleport to="body">
      <div
        v-if="fullscreen"
        ref="overlay"
        role="dialog"
        aria-modal="true"
        :aria-label="fullscreen.label"
        class="fixed inset-0 z-40 flex flex-col bg-bg p-4 sm:p-6"
        @keydown.esc.prevent="closeFullscreen"
        @keydown="trapTab"
      >
        <div class="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-2">
          <div class="flex items-center justify-between gap-3">
            <span class="font-mono text-[13px] text-muted">{{ fullscreen.label }}</span>
            <div class="flex items-center gap-[3px]">
              <button
                v-if="canConceal && fullscreen.set"
                type="button"
                :aria-label="peek[fullscreen.id] ? 'Hide the value' : 'Show the value'"
                :aria-pressed="!!peek[fullscreen.id]"
                class="inline-flex size-6 cursor-pointer items-center justify-center rounded-mini border-0 bg-transparent text-faint hover:text-ink"
                @click="peek[fullscreen.id] = !peek[fullscreen.id]"
              ><AppIcon :name="peek[fullscreen.id] ? 'eye-off' : 'eye'" :size="13" /></button>
              <button
                type="button"
                aria-label="Close the full-screen field"
                class="inline-flex size-6 cursor-pointer items-center justify-center rounded-mini border-0 bg-transparent text-faint hover:text-ink"
                @click="closeFullscreen"
              ><AppIcon name="collapse" :size="13" /></button>
            </div>
          </div>
          <textarea
            ref="fullscreenInput"
            v-model="fullscreenValue"
            :readonly="!fullscreen.set"
            :aria-label="fullscreen.label"
            placeholder="Value"
            autocomplete="off"
            spellcheck="false"
            :class="[concealed(fullscreen.id, fullscreenValue) ? 'conceal' : '', fullscreen.set ? '' : 'cursor-default']"
            class="min-h-0 w-full flex-1 resize-none rounded-card border border-border-strong bg-surface p-2.5 font-mono text-[13px] max-sm:text-[14px] leading-relaxed text-ink placeholder:font-sans placeholder:text-faint"
          />
        </div>
      </div>
    </Teleport>
  </div>
</template>
