<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import type { Fact } from '@/components/ui/AppPageFacts.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
import { describeError } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import { grantLabels } from '@/utils/capabilities'
import { countLabel, formatRelativeUpdate } from '@/utils/format'

const secrets = useSecretsStore()
const auth = useAuthStore()

// "Seal, Reveal and Push": no comma before the last item, because these read as names rather than a sentence.
function listSentence(values: string[]): string {
  if (values.length < 2) return values[0] ?? ''
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`
}

// The value every row agrees on, or null when they differ; an empty string counts as no shared fact.
function sharedString(values: string[]): string | null {
  return values.every((value) => value === values[0]) ? values[0] : null
}

const problemsOnly = ref(false)
const emptyOnly = ref(false)
const sortOrder = ref<'attention' | 'name'>('attention')

// Per-namespace tallies from the one cross-namespace listing; GET /namespaces carries no secret count and no drift at all.
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

// One scale for every bar on the page, so their lengths compare; without it each bar would be full width.
const maxTotal = computed(() => Math.max(1, ...[...fleet.value.values()].map((entry) => entry.total)))

const rows = computed(() =>
  secrets.namespaces.map((namespace) => {
    const paths = secrets.namespaceGitPaths(namespace.name)
    const tally = fleet.value.get(namespace.name)
    const total = tally?.total ?? 0
    const outOfSync = tally?.outOfSync ?? 0

    return {
      name: namespace.name,
      grants: grantLabels((capability) => auth.hasCapability(namespace.name, capability)),
      repository: [paths?.repository || namespace.git_mapping || '', paths?.branch ?? ''].filter(Boolean).join(' @ '),
      total,
      outOfSync,
      // Both segments are shares of the fleet's largest namespace, not of the tile, so one length across the grid means one size.
      ok: `${((total - outOfSync) / maxTotal.value) * 100}%`,
      bad: `${(outOfSync / maxTotal.value) * 100}%`,
    }
  }),
)

// A fact every namespace shares is stated once in the header, not printed on twenty tiles.
const shared = computed((): { repository: string; grants: string[] | null } => {
  // The header renders before the listing lands, so this is read with no rows at all.
  const first = rows.value[0]
  if (!first) return { repository: '', grants: null }
  return {
    repository: sharedString(rows.value.map((row) => row.repository)) || '',
    grants: sharedString(rows.value.map((row) => row.grants.join(', '))) === null ? null : first.grants,
  }
})

const grantClause = computed(() => {
  const grants = shared.value.grants
  if (!grants) return ''
  return grants.length ? `${listSentence(grants)} everywhere` : 'read only everywhere'
})

const hasContext = computed(() => Boolean(grantClause.value || shared.value.repository))

const totalSecrets = computed(() => [...fleet.value.values()].reduce((sum, entry) => sum + entry.total, 0))

const outOfSyncTotal = computed(() => [...fleet.value.values()].reduce((sum, entry) => sum + entry.outOfSync, 0))

const outOfSyncNamespaces = computed(() => [...fleet.value.values()].filter((entry) => entry.outOfSync).length)

const emptyCount = computed(() => rows.value.filter((row) => row.total === 0).length)

// The fleet's tally, with health only once the listing that knows about drift has landed: an unloaded index reports every namespace as clean.
const facts = computed<Fact[]>(() => {
  if (!rows.value.length) return []
  const items: Fact[] = [{ value: String(rows.value.length), label: rows.value.length === 1 ? 'namespace' : 'namespaces' }]
  if (!secrets.indexLoaded) return items
  items.push({ value: String(totalSecrets.value), label: 'SealedSecrets' })
  if (outOfSyncTotal.value) {
    items.push({
      value: String(outOfSyncTotal.value),
      label: `out of sync in ${countLabel(outOfSyncNamespaces.value, 'namespace')}`,
      tone: 'danger',
    })
  }
  return items
})

const lastCheckedTime = computed(() => {
  const timestamp = secrets.indexFetchedAt
  return timestamp === null
    ? ''
    : new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
})

const now = ref(Date.now())
const lastCheckedRelative = computed(() =>
  secrets.indexFetchedAt === null ? '' : formatRelativeUpdate(secrets.indexFetchedAt, now.value),
)

const lastCheckedDate = computed(() =>
  secrets.indexFetchedAt === null ? '' : new Date(secrets.indexFetchedAt).toISOString(),
)

// The two filters name disjoint sets; ordering applies consistently to the filtered and full list.
const visibleRows = computed(() => {
  const filtered = problemsOnly.value
    ? rows.value.filter((row) => row.outOfSync > 0)
    : emptyOnly.value
      ? rows.value.filter((row) => row.total === 0)
      : rows.value

  return [...filtered].sort((a, b) =>
    sortOrder.value === 'attention'
      ? b.outOfSync - a.outOfSync || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name),
  )
})

function toggle(which: 'problems' | 'empty') {
  if (which === 'problems') {
    problemsOnly.value = !problemsOnly.value
    emptyOnly.value = false
    return
  }
  emptyOnly.value = !emptyOnly.value
  problemsOnly.value = false
}

let relativeTimeInterval: number | undefined
onMounted(async () => {
  relativeTimeInterval = window.setInterval(() => { now.value = Date.now() }, 60_000)
  await Promise.all([
    // Reported through the store, which the error branch renders; catching here only stops an unhandled rejection.
    secrets.namespaces.length === 0 ? secrets.fetchNamespaces().catch(() => {}) : Promise.resolve(),
    // Every destination the page states is resolved from the mappings, so the page has to ask for them itself.
    secrets.gitPathsLoaded ? Promise.resolve() : secrets.fetchGitPaths(),
  ])
  // Off the critical path and never awaited: the tiles render from the namespace listing and pick up their counts when this lands.
  if (!secrets.indexLoaded && !secrets.indexLoading) secrets.fetchIndex().catch(() => {})
})
onUnmounted(() => {
  if (relativeTimeInterval !== undefined) window.clearInterval(relativeTimeInterval)
})

// Refresh re-fetches everything the page renders from: counts and drift come from the index, so refreshing namespaces alone looked dead.
const refreshing = ref(false)
async function refresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await Promise.all([
      secrets.fetchNamespaces().catch(() => {}),
      secrets.fetchIndex().catch(() => {}),
      secrets.fetchGitPaths().catch(() => {}),
    ])
  } finally {
    refreshing.value = false
  }
}
</script>

<template>
  <section aria-labelledby="page-title">
    <AppPageHeader title="Namespaces" title-id="page-title" :facts="facts">
      <template v-if="hasContext" #context><span v-if="grantClause">{{ grantClause }}<template v-if="shared.repository">, </template></span><span v-if="shared.repository">delivering to <span class="font-mono text-muted">{{ shared.repository }}</span></span></template>
      <template #actions>
        <span v-if="lastCheckedTime" class="whitespace-nowrap text-[11px] text-muted">
          Updated
          <time
            :datetime="lastCheckedDate"
            :title="`Updated ${lastCheckedTime}`"
            :aria-label="`Updated ${lastCheckedTime}`"
          >{{ lastCheckedRelative }}</time>
        </span>
        <AppButton icon="refresh" :loading="refreshing" @click="refresh">Refresh</AppButton>
      </template>
    </AppPageHeader>

    <p v-if="secrets.loading" role="status" class="flex items-center gap-2 page-x text-sm text-muted">
      <AppSpinner :size="15" />
      Loading namespaces…
    </p>

    <div class="page-x">
      <AppAlert v-if="secrets.error" type="error" title="Unable to load namespaces">
        <p class="m-0">{{ describeError(secrets.error, 'Unable to load namespaces') }}</p>
        <AppButton class="mt-2" icon="refresh" :loading="refreshing" @click="refresh">Try again</AppButton>
      </AppAlert>

      <AppEmpty
        v-else-if="!secrets.loading && secrets.namespaces.length === 0"
        description="No authorized namespaces. Your account has authenticated, but no namespace grants it a capability yet. Ask an administrator to map one."
      />
    </div>

    <template v-if="secrets.namespaces.length">
      <!-- Two named sets rather than a text box: "the two that are sick" is a question the fleet can answer. -->
      <div class="page-x flex max-sm:flex-wrap items-center gap-2.5 pt-[18px] pb-3.5">
        <button
          v-if="secrets.indexLoaded && outOfSyncTotal"
          type="button"
          :aria-pressed="problemsOnly"
          class="inline-flex h-[34px] cursor-pointer items-center gap-[7px] rounded-control border px-[13px] text-[13px] font-medium"
          :class="
            problemsOnly
              ? 'border-danger bg-danger text-danger-ink'
              : 'border-border-strong bg-surface-raised text-ink hover:border-muted'
          "
          @click="toggle('problems')"
        >
          <AppIcon name="alert" :size="14" />
          Needs attention <span class="font-mono">{{ outOfSyncTotal }}</span>
        </button>
        <button
          v-if="secrets.indexLoaded && emptyCount"
          type="button"
          :aria-pressed="emptyOnly"
          class="inline-flex h-[34px] cursor-pointer items-center gap-[7px] rounded-control border px-[13px] text-[13px] font-medium"
          :class="
            emptyOnly
              ? 'border-danger bg-danger text-danger-ink'
              : 'border-border-strong bg-surface-raised text-ink hover:border-muted'
          "
          @click="toggle('empty')"
        >
          <AppIcon name="database" :size="14" />
          Empty <span class="font-mono">{{ emptyCount }}</span>
        </button>
        <div class="ml-auto flex shrink-0 items-center gap-[2px] rounded-control border border-border bg-bg p-[3px]" role="group" aria-label="Namespace sort order">
          <button
            type="button"
            class="inline-flex h-7 cursor-pointer items-center justify-center rounded-chip border-0 px-2.5 text-xs"
            :class="sortOrder === 'attention' ? 'bg-ink text-bg' : 'bg-transparent text-ink hover:bg-surface-raised'"
            :aria-pressed="sortOrder === 'attention'"
            @click="sortOrder = 'attention'"
          >Attention</button>
          <button
            type="button"
            class="inline-flex h-7 cursor-pointer items-center justify-center rounded-chip border-0 px-2.5 text-xs"
            :class="sortOrder === 'name' ? 'bg-ink text-bg' : 'bg-transparent text-ink hover:bg-surface-raised'"
            :aria-pressed="sortOrder === 'name'"
            @click="sortOrder = 'name'"
          >Name A–Z</button>
        </div>
      </div>

      <AppEmpty
        v-if="!visibleRows.length"
        icon="namespace"
        :description="problemsOnly ? 'No namespace is out of sync.' : 'No namespace is empty.'"
      />

      <!-- One tile per namespace, and the tile — not a panel — is the surface; the foot is decorative, with the count and chip carrying the same facts in words. -->
      <ul v-else class="tiles draw m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(232px,1fr))] max-sm:grid-cols-1 gap-2.5 page-x pb-10">
        <li v-for="(row, index) in visibleRows" :key="row.name" :style="{ '--d': `${Math.min(index, 8) * 40}ms` }">
          <RouterLink
            :to="`/namespaces/${encodeURIComponent(row.name)}`"
            class="tiles-lift relative block overflow-hidden rounded-card border bg-surface px-[15px] pt-[15px] pb-[19px] no-underline hover:bg-surface-raised focus-visible:bg-surface-raised"
            :class="
              row.outOfSync
                ? 'border-[color-mix(in_srgb,var(--app-danger)_45%,var(--app-border))] hover:border-danger'
                : 'border-border hover:border-border-strong'
            "
          >
            <span class="name block truncate font-mono text-base font-semibold tracking-[-0.015em]" :class="row.total ? 'text-ink' : 'text-faint'">{{ row.name }}</span>

            <span class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span v-if="row.total"><span class="font-mono">{{ row.total }}</span> {{ row.total === 1 ? 'secret' : 'secrets' }}</span>
              <span v-else>no secrets</span>
              <span
                v-if="row.outOfSync"
                class="inline-flex items-center gap-[5px] rounded-chip border border-danger/40 px-1.5 py-px text-[11.5px] font-semibold text-danger"
              >
                <AppIcon name="alert" :size="11" />{{ row.outOfSync }} drifted
              </span>
            </span>

            <!-- Only when the fleet disagrees: a mapping every tile shares is stated once, above. -->            <span v-if="!shared.repository && row.repository" class="mt-1.5 block truncate font-mono text-xs text-faint">{{ row.repository }}</span>

            <span v-if="secrets.indexLoaded" class="level absolute inset-x-0 bottom-0 flex h-[3px]" aria-hidden="true">
              <i class="ok block h-full bg-accent/55" :style="{ width: row.ok, '--bar-ok': row.ok }" />
              <i class="bad block h-full bg-danger" :style="{ width: row.bad, '--bar-bad': row.bad }" />
            </span>
          </RouterLink>
        </li>
      </ul>
    </template>
  </section>
</template>
