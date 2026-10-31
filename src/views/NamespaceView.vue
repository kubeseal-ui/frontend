<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppNamespaceSwitcher from '@/components/AppNamespaceSwitcher.vue'
import type { Fact } from '@/components/ui/AppPageFacts.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
import { type IconName } from '@/components/ui/icons'
import { describeError } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import { grantLabels } from '@/utils/capabilities'
import { driftPresentation } from '@/utils/drift'
import { countLabel, formatCreatedDate } from '@/utils/format'

const props = defineProps<{ namespace: string }>()
const secrets = useSecretsStore()
const auth = useAuthStore()

// A usability affordance only: the server refuses an unauthorized seal independently.
const canSeal = computed(() => auth.hasCapability(props.namespace, 'secret:seal'))

function drift(status: string) {
  return driftPresentation(status)
}

type DriftFilter = 'all' | 'in-sync' | 'out-of-sync'

interface DriftFilterChip {
  value: DriftFilter
  label: string
  icon: IconName | ''
  tone: '' | 'danger' | 'success'
  count: number
}

const filter = ref<DriftFilter>('all')

// "Out of sync" covers every non-in-sync state: they all want the same thing from the reader.
const driftCounts = computed(() => {
  const total = secrets.secrets.length
  const inSync = secrets.secrets.filter((secret) => secret.git.drift === 'in-sync').length
  return { total, inSync, outOfSync: total - inSync }
})

const filters = computed<DriftFilterChip[]>(() => [
  { value: 'all', label: 'All', icon: '', tone: '', count: driftCounts.value.total },
  { value: 'in-sync', label: 'In sync', icon: 'check', tone: 'success', count: driftCounts.value.inSync },
  { value: 'out-of-sync', label: 'Out of sync', icon: 'alert', tone: 'danger', count: driftCounts.value.outOfSync },
])

// A filter earns its place only when it can exclude something: with everything in sync it offers a choice that does not exist.
const showFilter = computed(() => driftCounts.value.inSync > 0 && driftCounts.value.outOfSync > 0)

// One predicate for both sides, so a Secret cannot fall under neither chip nor both.
const visibleSecrets = computed(() => {
  if (filter.value === 'all') return secrets.secrets
  const wantSync = filter.value === 'in-sync'
  return secrets.secrets.filter((secret) => (secret.git.drift === 'in-sync') === wantSync)
})

const emptyFilterDescription = computed(() =>
  filter.value === 'in-sync' ? 'No SealedSecrets are in sync' : 'No SealedSecrets are out of sync')

// The constants of this namespace, lifted off the rows; a row that says what every other row says is a row nobody reads.
const facts = computed<Fact[]>(() => {
  if (!secrets.secretsLoaded || secrets.secrets.length === 0) return []
  const keys = secrets.secrets.reduce((sum, secret) => sum + (secret.key_count || 0), 0)
  const scopes = secrets.secrets.map((secret) => secret.scope || 'strict')
  const scope = scopes.every((value) => value === scopes[0]) ? scopes[0] : ''
  const out = driftCounts.value.outOfSync

  const items: Fact[] = [
    { value: String(secrets.secrets.length), label: 'SealedSecrets' },
    { value: String(keys), label: keys === 1 ? 'key' : 'keys' },
  ]
  if (scope) items.push({ value: scope, label: 'scope' })
  items.push(
    out === 0
      ? { label: 'all in sync', tone: 'success' }
      : { value: String(out), label: 'out of sync', tone: 'danger' },
  )
  return items
})

const hasContext = computed(() => Boolean(destination.value || grantLine.value))

const destination = computed(() => {
  const paths = secrets.namespaceGitPaths(props.namespace)
  return [paths?.repository ?? '', paths?.branch ?? ''].filter(Boolean).join(' @ ')
})

const grantLine = computed(() =>
  grantLabels((capability) => auth.hasCapability(props.namespace, capability)).join(', '))

// Joins a listing already in flight rather than asking twice: the store keys it by namespace.
const load = () => secrets.ensureSecrets(props.namespace).catch(() => {})

// Refresh forces a re-fetch, where load() is a no-op: ensureSecrets returns the cached listing, so Refresh looked dead on a loaded namespace.
const refreshing = ref(false)
async function refresh() {
  if (refreshing.value) return
  refreshing.value = true
  try {
    await secrets.fetchSecrets(props.namespace).catch(() => {})
  } finally {
    refreshing.value = false
  }
}

load()
// This instance is reused when the parameter changes, so without the watch one namespace's listing renders under the next namespace's name.
watch(() => props.namespace, load)
</script>

<template>
  <section aria-labelledby="namespace-title">
    <AppPageHeader :title="props.namespace" title-id="namespace-title" :facts="facts">
      <template #back>
        <RouterLink
          to="/"
          class="inline-flex items-center gap-1.5 text-[12.5px] text-muted no-underline hover:text-ink"
        >
          <AppIcon name="chevron-left" :size="12" />
          All namespaces
        </RouterLink>
      </template>

      <template v-if="hasContext" #context><span v-if="destination">delivering to <span class="font-mono text-muted">{{ destination }}</span><template v-if="grantLine"> · </template></span><span v-if="grantLine">{{ grantLine }}</span></template>

      <template #actions>
        <!-- A link, not a button: AppButton renders a bare <button>, and navigating is what this does; the classes restate its primary variant including the size. -->
        <RouterLink
          v-if="canSeal"
          :to="`/namespaces/${encodeURIComponent(props.namespace)}/new`"
          class="inline-flex h-9 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-control border border-transparent bg-accent px-3.5 text-[13px] font-semibold text-accent-ink no-underline transition hover:brightness-95"
        >
          <AppIcon name="plus" :size="16" />
          New Secret
        </RouterLink>
        <AppButton icon="refresh" :loading="refreshing" @click="refresh">Refresh</AppButton>
      </template>
    </AppPageHeader>

    <AppNamespaceSwitcher :namespace="props.namespace" />

    <!-- Gated on the request, not `secretsLoaded`: that flag is only set by a successful fetch, so `!secretsLoaded` would keep claiming to load after a failure. -->
    <p v-if="secrets.loading" role="status" class="flex items-center gap-2 page-x pt-4 text-sm text-muted">
      <AppSpinner :size="15" />
      Loading secrets…
    </p>

    <div class="page-x pt-4">
      <AppAlert v-if="secrets.error" type="error" title="Unable to load secrets">
        <p class="m-0">{{ describeError(secrets.error, 'Unable to load secrets') }}</p>
        <AppButton class="mt-2" icon="refresh" :loading="refreshing" @click="refresh">Try again</AppButton>
      </AppAlert>

      <AppEmpty
        v-else-if="secrets.secretsLoaded && !secrets.loading && secrets.secrets.length === 0"
        icon="database"
        description="No SealedSecrets in this namespace"
      />
    </div>

    <template v-if="secrets.secrets.length">
      <!-- Real buttons with aria-pressed, so the state is announced and keyboard-reachable. -->
      <div v-if="showFilter" class="flex flex-wrap items-center gap-1.5 page-x pt-[15px] pb-[13px]" role="group" aria-label="Filter by drift">
        <button
          v-for="chip in filters"
          :key="chip.value"
          type="button"
          class="inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[8px] border border-border-strong bg-transparent px-3 text-[12.5px] font-semibold whitespace-nowrap text-muted hover:border-muted hover:text-ink"
          :class="
            filter === chip.value
              ? chip.tone === 'danger'
                ? 'border-danger bg-danger text-danger-ink'
                : 'border-ink bg-ink text-bg'
              : ''
          "
          :aria-pressed="filter === chip.value"
          @click="filter = chip.value"
        >
          <AppIcon v-if="chip.icon" :name="chip.icon" :size="12" />
          {{ chip.label }}
          <span class="font-mono font-medium opacity-75">{{ chip.count }}</span>
        </button>
      </div>

      <AppEmpty
        v-if="visibleSecrets.length === 0"
        icon="database"
        :description="emptyFilterDescription"
      />

      <!-- A ledger of what is where and how old it is — never what is inside: key names stay on the Secret's own screen. The left edge is the state column. -->
      <div v-else class="page-x pb-11">
        <ul class="m-0 list-none p-0" aria-label="SealedSecrets">
          <li v-for="secret in visibleSecrets" :key="secret.name" class="contents">
            <RouterLink
              :to="`/secrets/${encodeURIComponent(props.namespace)}/${encodeURIComponent(secret.name)}`"
              class="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-[3px] border-b border-b-border border-l-2 pr-[15px] pt-3 pb-[13px] pl-[13px] no-underline transition-colors duration-[110ms] hover:bg-surface focus-visible:bg-surface [&:hover_.name]:text-accent"
              :class="drift(secret.git.drift).gutter"
            >
              <span class="flex min-w-0 items-center gap-2.5">
                <span class="name truncate font-mono text-[14.5px] font-semibold tracking-[-0.01em] text-ink">{{ secret.name }}</span>
                <span
                  v-if="secret.git.drift !== 'in-sync'"
                  class="inline-flex shrink-0 items-center gap-[5px] rounded-chip border px-1.5 py-px text-[11px] font-semibold whitespace-nowrap"
                  :class="drift(secret.git.drift).classes"
                >
                  <AppIcon :name="drift(secret.git.drift).icon" :size="11" />
                  {{ drift(secret.git.drift).label }}
                </span>
              </span>

              <span class="font-mono text-xs whitespace-nowrap text-faint">{{ countLabel(secret.key_count, 'key') }}</span>

              <span class="col-span-full flex min-w-0 max-sm:flex-wrap items-baseline gap-x-[7px] gap-y-0.5 font-mono text-[11.5px] text-muted">
                <span v-if="secret.git.file_path" class="min-w-0 break-all" :title="secret.git.file_path">{{ secret.git.file_path }}</span>
                <span v-else class="text-warning">not in git</span>
                <span class="shrink-0 text-border-strong" aria-hidden="true">·</span>
                <span class="shrink-0 whitespace-nowrap text-faint">{{ formatCreatedDate(secret.created_at) }}</span>
              </span>
            </RouterLink>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>
