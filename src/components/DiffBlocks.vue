<script setup lang="ts">
import { computed, ref } from 'vue'

// One grid, two columns, the rule between them drawn by the 1px gap; the pane headings tell before from after, so neither column carries a border.
const props = defineProps<{ before?: string; after: string; beforeLabel?: string; afterLabel?: string }>()

const lines = (text?: string) => (text ? text.replace(/\n$/, '').split('\n') : [])

type Op = { type: 'same' | 'del' | 'add'; text: string }
type DiffRow = { left: string; right: string; lk: 'same' | 'del' | 'add'; rk: 'same' | 'del' | 'add' }
type RowGroup =
  | { kind: 'rows'; rows: DiffRow[] }
  | { kind: 'collapsed'; id: number; rows: DiffRow[]; expanded: boolean }

// Longest common subsequence, then adjacent deletes and adds are zipped so a changed key reads across rather than as a deletion above an insertion.
function align(before: string[], after: string[]): Op[] {
  const n = before.length
  const m = after.length
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (before[i] === after[j]) { ops.push({ type: 'same', text: before[i] }); i++; j++ }
    else if (table[i + 1][j] >= table[i][j + 1]) ops.push({ type: 'del', text: before[i++] })
    else ops.push({ type: 'add', text: after[j++] })
  }
  while (i < n) ops.push({ type: 'del', text: before[i++] })
  while (j < m) ops.push({ type: 'add', text: after[j++] })
  return ops
}

// A create has no before, so the one column names what is about to be written rather than pairing with an empty one.
const paired = computed(() => Boolean(props.before))
const afterHeading = computed(() => props.afterLabel || (paired.value ? 'Git, after' : 'What will be written'))
const beforeHeading = computed(() => props.beforeLabel || 'Git, before')

const rows = computed(() => {
  const ops = align(lines(props.before), lines(props.after))
  const out: DiffRow[] = []
  let index = 0
  while (index < ops.length) {
    if (ops[index].type === 'same') {
      out.push({ left: ops[index].text, right: ops[index].text, lk: 'same', rk: 'same' })
      index++
      continue
    }
    const removed: string[] = []
    const added: string[] = []
    while (index < ops.length && ops[index].type === 'del') removed.push(ops[index++].text)
    while (index < ops.length && ops[index].type === 'add') added.push(ops[index++].text)
    for (let row = 0; row < Math.max(removed.length, added.length); row++) {
      const gone = removed[row]
      const born = added[row]
      out.push({
        left: gone ?? ' ',
        right: born ?? ' ',
        lk: gone === undefined ? 'same' : 'del',
        rk: born === undefined ? 'same' : 'add',
      })
    }
  }
  return out
})

const expandedGroups = ref(new Set<number>())

const rowGroups = computed<RowGroup[]>(() => {
  const groups: RowGroup[] = []
  const contextLines = 2
  const collapseThreshold = 7
  let index = 0

  while (index < rows.value.length) {
    const start = index
    const unchanged = rows.value[index].lk === 'same' && rows.value[index].rk === 'same'
    while (
      index < rows.value.length &&
      (rows.value[index].lk === 'same' && rows.value[index].rk === 'same') === unchanged
    ) index++

    const run = rows.value.slice(start, index)
    if (!unchanged || run.length < collapseThreshold) {
      groups.push({ kind: 'rows', rows: run })
      continue
    }

    const hiddenStart = start + contextLines
    const hiddenEnd = index - contextLines
    groups.push({ kind: 'rows', rows: rows.value.slice(start, hiddenStart) })
    groups.push({
      kind: 'collapsed',
      id: start,
      rows: rows.value.slice(hiddenStart, hiddenEnd),
      expanded: expandedGroups.value.has(start),
    })
    groups.push({ kind: 'rows', rows: rows.value.slice(hiddenEnd, index) })
  }

  return groups
})

function toggleGroup(id: number) {
  const next = new Set(expandedGroups.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedGroups.value = next
}

// The tone classes are spelled out here because Tailwind cannot see a class built at runtime.
const TONES: Record<DiffRow['lk'], string> = { same: 'text-faint', add: 'text-success', del: 'text-danger' }
</script>

<template>
  <div class="flex flex-col">
    <!-- Unpaired, the heading names the whole box; it is keyed inside the same roll as the press bar's label so the two advance together. -->
    <span v-if="!paired" class="mb-2 block font-sans text-[11px] font-semibold text-muted">
      <Transition mode="out-in" enter-active-class="roll-next" leave-active-class="roll-out">
        <span :key="afterHeading" class="inline-block">{{ afterHeading }}</span>
      </Transition>
    </span>
    <div
      class="grid max-sm:grid-cols-1 overflow-hidden rounded-[10px] border border-border bg-border"
      :class="paired ? 'grid-cols-2 gap-px' : ''"
    >
      <template v-if="paired">
        <div class="bg-surface px-[13px] pt-[10px] font-sans text-[11px] font-semibold text-muted">{{ beforeHeading }}</div>
        <div class="bg-surface px-[13px] pt-[10px] font-sans text-[11px] font-semibold text-muted">{{ afterHeading }}</div>
        <template v-for="(group, groupIndex) in rowGroups" :key="groupIndex">
          <template v-if="group.kind === 'rows'">
            <template v-for="(row, rowIndex) in group.rows" :key="`${groupIndex}-${rowIndex}`">
              <div class="max-sm:break-all bg-surface px-[13px] font-mono text-[11.5px] leading-[1.85]" :class="TONES[row.lk]">{{ row.left }}</div>
              <div class="max-sm:break-all bg-surface px-[13px] font-mono text-[11.5px] leading-[1.85]" :class="TONES[row.rk]">{{ row.right }}</div>
            </template>
          </template>
          <template v-else-if="group.expanded">
            <template v-for="(row, rowIndex) in group.rows" :key="`${group.id}-${rowIndex}`">
              <div class="max-sm:break-all bg-surface px-[13px] font-mono text-[11.5px] leading-[1.85]" :class="TONES[row.lk]">{{ row.left }}</div>
              <div class="max-sm:break-all bg-surface px-[13px] font-mono text-[11.5px] leading-[1.85]" :class="TONES[row.rk]">{{ row.right }}</div>
            </template>
            <button
              type="button"
              class="col-span-2 max-sm:col-span-1 cursor-pointer border-0 bg-surface-raised px-3 py-1.5 text-left text-[11px] font-medium text-muted hover:text-ink"
              :aria-expanded="true"
              @click="toggleGroup(group.id)"
            >Hide {{ group.rows.length }} unchanged lines</button>
          </template>
          <button
            v-else
            type="button"
            class="col-span-2 max-sm:col-span-1 cursor-pointer border-0 bg-surface-raised px-3 py-1.5 text-left text-[11px] font-medium text-muted hover:text-ink"
            :aria-expanded="false"
            @click="toggleGroup(group.id)"
          >Show {{ group.rows.length }} unchanged lines</button>
        </template>
      </template>
      <div v-else class="col-span-2 max-sm:col-span-1 max-sm:break-all bg-surface px-[13px] py-[10px] font-mono text-[11.5px] leading-[1.85]">
        <div v-for="(row, index) in rows" :key="`a${index}`" :class="TONES[row.rk]">{{ row.right }}</div>
      </div>
    </div>
  </div>
</template>
