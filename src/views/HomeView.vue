<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
import { describeError } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import { grantLabels } from '@/utils/capabilities'
import { countLabel } from '@/utils/format'
import type { Namespace, NamespaceGitPaths } from '@/types'

const secrets = useSecretsStore()
const auth = useAuthStore()

// "No mapping" is claimed only once the listing has loaded: an absent listing also means
// the request failed, and those are not the same fact.
function gitSummary(namespace: Namespace, paths: NamespaceGitPaths | null): string {
  const mode = paths?.mode || namespace.delivery_mode || ''
  if (paths) {
    // A wildcard is the mapping this namespace falls back to rather than one of its own, and it
    // has no directory count to print: "0 directories" would read as "nowhere to deliver".
    if (paths.namespace === '*') return `Shared mapping${mode ? ` · ${mode}` : ''}`
    const count = paths.allowed_paths?.length ?? 0
    return `${count} ${count === 1 ? 'directory' : 'directories'}${mode ? ` · ${mode}` : ''}`
  }
  if (namespace.git_managed) return `Git managed${mode ? ` · ${mode}` : ''}`
  return secrets.gitPathsLoaded ? 'No Git mapping' : 'Git status unavailable'
}

// The value every row agrees on, or null when they differ. An empty string counts as no shared
// fact — "every namespace maps to nothing" is not a sentence worth printing.
function sharedString(values: string[]): string | null {
  return values.every((value) => value === values[0]) ? values[0] : null
}

// "Seal and Reveal", "Seal, Reveal, and Admin": the comma before the last item matches the
// lists in the documentation, and two items joined as "Seal, and Reveal" would read as a typo.
function listSentence(values: string[]): string {
  if (values.length < 2) return values[0] ?? ''
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`
}

const filter = ref('')
// Set by the attention line: a namespace list is a poor place to hunt for the two that are sick.
const problemsOnly = ref(false)

// Per-namespace tallies from the one cross-namespace listing. Nothing else can produce them:
// GET /namespaces carries no secret count and no drift at all, so without this the index can
// only ever be a table of names.
const fleet = computed(() => {
  const counts = new Map<string, { total: number; outOfSync: number }>()
  for (const secret of secrets.index) {
    const entry = counts.get(secret.namespace) ?? { total: 0, outOfSync: 0 }
    entry.total += 1
    if ((secret.git?.drift || 'unknown') !== 'in-sync') entry.outOfSync += 1
    counts.set(secret.namespace, entry)
  }
  return counts
})

// One scale for every bar on the page, so their lengths compare. Without it each bar would be
// full width and the chart would say nothing.
const maxTotal = computed(() => Math.max(1, ...[...fleet.value.values()].map((entry) => entry.total)))

// The grants and the delivery destination are readable here and nowhere else: the strip is a
// search box and the namespace page is one namespace, so this is the only screen that answers
// what a namespace will let you do before you open it.
const rows = computed(() =>
  secrets.namespaces.map((namespace) => {
    const paths = secrets.namespaceGitPaths(namespace.name)
    const repository = paths?.repository || namespace.git_mapping || ''
    const branch = paths?.branch ?? ''
    const tally = fleet.value.get(namespace.name)
    const total = tally?.total ?? 0
    const outOfSync = tally?.outOfSync ?? 0

    return {
      name: namespace.name,
      grants: grantLabels((capability) => auth.hasCapability(namespace.name, capability)),
      repository: [repository, branch].filter(Boolean).join(' @ '),
      mode: paths?.mode || namespace.delivery_mode || '',
      summary: gitSummary(namespace, paths),
      total,
      outOfSync,
      // Bars share the fleet's largest namespace as their full width; within a bar the
      // out-of-sync share is carved out, so one mark carries both size and health.
      fill: `${(total / maxTotal.value) * 100}%`,
      neutral: total ? `${((total - outOfSync) / total) * 100}%` : '0%',
      diverged: total ? `${(outOfSync / total) * 100}%` : '0%',
    }
  }),
)

// Collapsing only pays across more than one row, and one condition drives both the header and
// the rows: a fact withheld from a row has to be stated above it, or it is simply lost.
const collapsing = computed(() => rows.value.length > 1)

// A fact every namespace shares is stated once, in the header. Printed per row it was the same
// grants on twenty rows, when the name is the only thing that actually differs between them.
const uniform = computed(() => {
  if (!collapsing.value) return { repository: null, summary: null, mode: '', grants: null as string[] | null }
  return {
    repository: sharedString(rows.value.map((row) => row.repository)) || null,
    summary: sharedString(rows.value.map((row) => row.summary)),
    mode: sharedString(rows.value.map((row) => row.mode)) ?? '',
    grants: sharedString(rows.value.map((row) => row.grants.join(', '))) === null ? null : rows.value[0].grants,
  }
})

// The fleet's delivery policy, as the header's context. The destination is named only when the
// rows agreed on their summary too: a row that keeps its own summary already states its mode.
const fleetContext = computed(() => {
  if (!collapsing.value) return ''
  const parts: string[] = []
  if (uniform.value.repository) {
    const mode = uniform.value.summary === null ? '' : uniform.value.mode
    parts.push(mode === 'proposal' ? `proposes to ${uniform.value.repository}` : `delivers to ${uniform.value.repository}`)
  }
  if (uniform.value.grants) {
    parts.push(uniform.value.grants.length ? uniform.value.grants.join(', ') : 'read only')
  }
  return parts.join(' · ')
})

// The landing page's whole reason to exist: a fleet where the answer is "nothing" says nothing.
const attention = computed(() => {
  if (!secrets.indexLoaded) return ''
  let total = 0
  let affected = 0
  for (const entry of fleet.value.values()) {
    total += entry.outOfSync
    if (entry.outOfSync) affected += 1
  }
  if (!total) return ''
  return `${countLabel(total, 'SealedSecret')} out of sync in ${countLabel(affected, 'namespace')}`
})

const visibleRows = computed(() => {
  const query = filter.value.trim().toLowerCase()
  let list = rows.value
  if (problemsOnly.value) list = list.filter((row) => row.outOfSync > 0)
  if (query) list = list.filter((row) => row.name.toLowerCase().includes(query))
  return list
})

const subtitle = computed(() => {
  if (!rows.value.length) return ''
  const parts = [countLabel(rows.value.length, 'namespace')]
  if (secrets.indexLoaded) {
    const total = [...fleet.value.values()].reduce((sum, entry) => sum + entry.total, 0)
    parts.push(countLabel(total, 'SealedSecret'))
  }
  return parts.join(' · ')
})

onMounted(async () => {
  await Promise.all([
    // Reported through the store, which the error branch renders; catching here only
    // stops it leaving this hook as an unhandled rejection.
    secrets.namespaces.length === 0 ? secrets.fetchNamespaces().catch(() => {}) : Promise.resolve(),
    secrets.gitPaths ? Promise.resolve() : secrets.fetchGitPaths(),
  ])
  // Off the critical path, and never awaited: the rows render from the namespace listing and
  // pick up their counts when this lands. A failure leaves the names standing — this is the
  // same listing the strip's search waits for, so an answer here also warms that index.
  if (!secrets.indexLoaded && !secrets.indexLoading) secrets.fetchIndex().catch(() => {})
})
</script>

<template>
  <section aria-labelledby="page-title">
    <AppPageHeader title="Namespaces" title-id="page-title" :subtitle="subtitle" :context="fleetContext">
      <template #actions>
        <AppButton icon="refresh" @click="secrets.fetchNamespaces">Refresh</AppButton>
      </template>
    </AppPageHeader>

    <p v-if="secrets.loading" role="status" class="mb-4 flex items-center gap-2 text-sm text-muted">
      <AppSpinner :size="15" />
      Loading namespaces…
    </p>

    <AppAlert v-if="secrets.error" type="error" title="Unable to load namespaces">
      <p class="m-0">{{ describeError(secrets.error, 'Unable to load namespaces') }}</p>
      <AppButton class="mt-2" icon="refresh" @click="secrets.fetchNamespaces">Try again</AppButton>
    </AppAlert>

    <AppEmpty
      v-else-if="!secrets.loading && secrets.namespaces.length === 0"
      description="No authorized namespaces. Your account has authenticated, but no namespace grants it a capability yet — ask an administrator to map one."
    />

    <template v-else>
      <!-- Silent when the fleet is clean, which is the point: it is the one line on this page
           that is allowed to be absent, so its presence always means something. -->
      <button
        v-if="attention"
        type="button"
        class="mb-3 flex w-full cursor-pointer items-center gap-2 border-l-2 border-l-warning bg-transparent py-1.5 pl-3 text-left text-[0.8125rem] font-medium text-warning"
        :aria-pressed="problemsOnly"
        @click="problemsOnly = !problemsOnly"
      >
        <AppIcon name="alert" :size="14" />
        {{ attention }}
        <span class="ml-auto text-xs font-normal text-muted">{{ problemsOnly ? 'Show all' : 'Show only these' }}</span>
      </button>

      <div v-if="collapsing" class="mb-4 flex flex-wrap items-center gap-3">
        <AppInput
          v-model="filter"
          type="search"
          ariaLabel="Filter namespaces"
          placeholder="Filter namespaces"
          class="max-w-xs"
        />
        <p v-if="filter.trim() && visibleRows.length" role="status" class="m-0 text-sm text-muted">
          Showing {{ visibleRows.length }} of {{ rows.length }} namespaces.
        </p>
      </div>

      <AppEmpty
        v-if="visibleRows.length === 0"
        icon="namespace"
        :description="`No namespace matches “${filter.trim()}”.`"
      />

      <!-- Tiles, one per namespace. Each tile is the object the page is about, so the tile — not a
           panel around the grid — is the surface here; the level bar along its foot is
           its size and its health in one mark, and it is decorative — the count and the chip above
           it already say both in words. -->
      <ul v-else class="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3 p-0">
        <li v-for="row in visibleRows" :key="row.name">
          <RouterLink
            :to="`/namespaces/${encodeURIComponent(row.name)}`"
            class="flex h-full flex-col gap-2 rounded-card border bg-surface p-4 no-underline transition hover:bg-surface-raised focus-visible:bg-surface-raised"
            :class="row.outOfSync ? 'border-danger/40' : 'border-border'"
          >
            <h2 class="m-0 min-w-0 truncate font-mono text-base font-medium text-ink">{{ row.name }}</h2>

            <p class="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span>{{ countLabel(row.total, 'secret') }}</span>
              <span
                v-if="row.outOfSync"
                class="inline-flex items-center rounded-chip border border-danger/40 px-1.5 py-px text-[0.6875rem] font-semibold text-danger"
              >{{ row.outOfSync }} out of sync</span>
            </p>

            <!-- Only what this tile does not share with the rest. -->
            <span v-if="!uniform.grants" class="flex flex-wrap gap-1">
              <span
                v-for="grant in row.grants"
                :key="grant"
                class="rounded-chip border border-border px-2 py-0.5 text-xs font-semibold text-muted"
              >{{ grant }}</span>
              <span
                v-if="row.grants.length === 0"
                class="rounded-chip border border-border px-2 py-0.5 text-xs font-semibold text-muted"
              >Read only</span>
            </span>

            <span v-if="!uniform.repository && row.repository" class="truncate font-mono text-xs text-muted" :title="row.repository">
              {{ row.repository }}
            </span>
            <span v-if="!uniform.summary" class="text-xs text-muted">{{ row.summary }}</span>

            <span
              v-if="secrets.indexLoaded"
              class="mt-auto block h-[3px] overflow-hidden rounded-full bg-border"
              aria-hidden="true"
            >
              <span class="flex h-full" :style="{ width: row.fill }">
                <span class="h-full bg-border-strong" :style="{ width: row.neutral }" />
                <span class="h-full bg-danger" :style="{ width: row.diverged }" />
              </span>
            </span>
          </RouterLink>
        </li>
      </ul>
    </template>
  </section>
</template>
