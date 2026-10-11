<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
import { type IconName } from '@/components/ui/icons'
import { describeError } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import { grantLabels } from '@/utils/capabilities'
import { driftPresentation } from '@/utils/drift'
import { countLabel, formatDate } from '@/utils/format'
import type { SealedSecretSummary } from '@/types'

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
  icon: IconName
  classes: string
  count: number
}

const filter = ref<DriftFilter>('all')

// "Out of sync" covers every non-in-sync state: they all want the same thing from the reader.
const driftCounts = computed(() => {
  const total = secrets.secrets.length
  const inSync = secrets.secrets.filter((secret) => secret.git.drift === 'in-sync').length
  return { total, inSync, outOfSync: total - inSync }
})

// Labels, glyphs and colours come from the shared vocabulary, so a chip cannot drift away
// from the row it filters.
const filters = computed<DriftFilterChip[]>(() => [
  { value: 'all', label: 'All', icon: 'database', classes: drift('unknown').classes, count: driftCounts.value.total },
  { value: 'in-sync', label: drift('in-sync').label, icon: drift('in-sync').icon, classes: drift('in-sync').classes, count: driftCounts.value.inSync },
  { value: 'out-of-sync', label: 'Out of sync', icon: drift('diverged').icon, classes: drift('diverged').classes, count: driftCounts.value.outOfSync },
])

// A filter earns its place only when it can exclude something. With one state present, the
// metadata line has already said what it would let you choose between.
const showFilter = computed(() => driftCounts.value.inSync > 0 && driftCounts.value.outOfSync > 0)

// One predicate for both sides, so a Secret cannot fall under neither chip nor both.
const visibleSecrets = computed(() => {
  if (filter.value === 'all') return secrets.secrets
  const wantSync = filter.value === 'in-sync'
  return secrets.secrets.filter((secret) => (secret.git.drift === 'in-sync') === wantSync)
})

const emptyFilterDescription = computed(() =>
  filter.value === 'in-sync' ? 'No SealedSecrets are in sync' : 'No SealedSecrets are out of sync')

// The constants of this namespace, lifted off the rows. Printed per row they were the same
// sentence ten times, and a row that says what every other row says is a row nobody reads.
// The scope joins them only when every Secret agrees on it; when they do not, it stays on the
// rows that differ.
const uniformScope = computed(() => {
  const scopes = secrets.secrets.map((secret) => secret.scope || 'strict')
  return scopes.length && scopes.every((scope) => scope === scopes[0]) ? scopes[0] : ''
})

const summaryLine = computed(() => {
  if (!secrets.secretsLoaded || secrets.secrets.length === 0) return ''
  const keys = secrets.secrets.reduce((sum, secret) => sum + (secret.key_count || 0), 0)
  const out = driftCounts.value.outOfSync
  return [
    countLabel(secrets.secrets.length, 'SealedSecret'),
    countLabel(keys, 'key'),
    uniformScope.value ? `${uniformScope.value} scope` : '',
    out === 0 ? 'all in sync' : `${out} out of sync`,
  ]
    .filter(Boolean)
    .join(' · ')
})

const contextLine = computed(() => {
  const paths = secrets.namespaceGitPaths(props.namespace)
  const where = [paths?.repository ?? '', paths?.branch ?? ''].filter(Boolean).join(' @ ')
  const mode = paths?.mode || secrets.namespaceDeliveryMode(props.namespace) || ''
  const grants = grantLabels((capability) => auth.hasCapability(props.namespace, capability))

  const parts: string[] = []
  if (where) parts.push(mode === 'proposal' ? `proposes to ${where}` : `delivers to ${where}`)
  if (grants.length) parts.push(grants.join(', '))
  return parts.join(' · ')
})

// Joins a listing already in flight rather than asking twice: the store keys it by namespace.
const load = () => secrets.ensureSecrets(props.namespace).catch(() => {})

// A row states what is in a Secret — its key names — because that is the one thing a page of
// rows can say that a search result cannot. Capped rather than wrapped freely: `keys` arrives
// from `spec.encryptedData` without decrypting, so a Secret carrying a whole dashboard's worth
// of keys would otherwise take seven lines and make the list ragged. The overflow is named,
// never silently dropped.
const KEY_PREVIEW = 8
const hasKeys = (secret: SealedSecretSummary) => Boolean(secret.keys?.length)
const keyPreview = (secret: SealedSecretSummary) => (secret.keys ?? []).slice(0, KEY_PREVIEW)
const keyOverflow = (secret: SealedSecretSummary) =>
  secret.keys ? Math.max(0, secret.key_count - Math.min(secret.keys.length, KEY_PREVIEW)) : 0

load()
// The route record is the same one for every namespace and <RouterView /> is unkeyed, so this
// instance is reused when the parameter changes. Without the watch, going Back from one namespace
// to another renders the listing that was already in the store under the new namespace's name.
watch(() => props.namespace, load)
</script>

<template>
  <section aria-labelledby="namespace-title">
    <RouterLink
      to="/"
      class="mb-3 inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-accent no-underline hover:underline"
    >
      <AppIcon name="chevron-left" :size="13" />
      Namespaces
    </RouterLink>

    <AppPageHeader
      :title="props.namespace"
      title-id="namespace-title"
      mono
      :subtitle="summaryLine"
      :context="contextLine"
    >
      <template #actions>
        <!-- A link, not a button: AppButton renders a bare <button>, and navigating is what
             this does. The classes restate its primary variant. -->
        <RouterLink
          v-if="canSeal"
          :to="`/namespaces/${encodeURIComponent(props.namespace)}/new`"
          class="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-chip border border-transparent bg-accent px-3.5 py-1.5 text-sm font-semibold text-bg no-underline transition hover:brightness-110"
        >
          <AppIcon name="plus" :size="16" />
          Create new Secret
        </RouterLink>
        <AppButton icon="refresh" @click="load">Refresh</AppButton>
      </template>
    </AppPageHeader>

    <!-- Gated on the request, not on `secretsLoaded`: that flag is only ever set by a fetch
         that succeeded, so `!secretsLoaded` keeps claiming to load after one that failed. -->
    <p v-if="secrets.loading" role="status" class="mb-4 flex items-center gap-2 text-sm text-muted">
      <AppSpinner :size="15" />
      Loading secrets…
    </p>

    <AppAlert v-if="secrets.error" type="error" title="Unable to load secrets">
      <p class="m-0">{{ describeError(secrets.error, 'Unable to load secrets') }}</p>
      <AppButton class="mt-2" icon="refresh" @click="load">Try again</AppButton>
    </AppAlert>

    <AppEmpty
      v-else-if="secrets.secretsLoaded && !secrets.loading && secrets.secrets.length === 0"
      icon="database"
      description="No SealedSecrets in this namespace"
    />

    <template v-else>
      <!-- Real buttons with aria-pressed, so the state is announced and keyboard-reachable,
           and selection is not colour alone. -->
      <div v-if="showFilter" class="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by drift">
        <button
          v-for="chip in filters"
          :key="chip.value"
          type="button"
          class="inline-flex cursor-pointer items-center gap-1 rounded-chip border px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition"
          :class="[chip.classes, filter === chip.value ? 'ring-2 ring-current' : 'opacity-60 hover:opacity-100']"
          :aria-pressed="filter === chip.value"
          @click="filter = chip.value"
        >
          <AppIcon :name="chip.icon" :size="12" />
          {{ chip.label }}
          <span class="font-normal opacity-80">{{ chip.count }}</span>
        </button>
      </div>

      <AppEmpty
        v-if="visibleSecrets.length === 0"
        icon="database"
        :description="emptyFilterDescription"
      />

      <!-- A ledger: identity in the left column, contents in the right one. A SealedSecret's key
           names are readable where its values are not, so they are what the row has to show —
           and a row grows with what is in it, which is why the big Secret looks big.
           border-t rows rather than a card each: a rounded surface is drawn for an object, never for
           a group of them, and a list of cards is a list nobody reads. The left edge is the state
           column — silent on a Secret that is in sync, so the eye finds the three that are not. -->
      <ul v-else class="m-0 list-none border-t border-border p-0" aria-label="SealedSecrets">
        <li v-for="secret in visibleSecrets" :key="secret.name" class="border-b border-border">
          <RouterLink
            :to="`/secrets/${encodeURIComponent(props.namespace)}/${encodeURIComponent(secret.name)}`"
            class="group grid grid-cols-1 gap-x-6 gap-y-1 border-l-2 py-3 pr-2 pl-3 no-underline transition hover:bg-surface-raised focus-visible:bg-surface-raised sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto]"
            :class="drift(secret.git.drift).gutter"
          >
            <span class="min-w-0">
              <h2 class="m-0 truncate font-mono text-[0.9375rem] font-medium text-ink">{{ secret.name }}</h2>
              <!-- The facts that are not in the name: how much is in it, when it was sealed, and
                   where the manifest lives in Git. Each is a thing the operator would otherwise
                   have to open the Secret to find. -->
              <span class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span>{{ countLabel(secret.key_count, 'key') }}</span>
                <span v-if="!uniformScope">{{ secret.scope || 'strict' }} scope</span>
                <span class="tabular-nums">{{ formatDate(secret.created_at) }}</span>
                <span
                  v-if="secret.git.file_path"
                  class="min-w-0 max-w-[22rem] truncate font-mono"
                  :title="secret.git.file_path"
                >{{ secret.git.file_path }}</span>
                <!-- Only the rows that differ from the namespace's own state wear a chip. -->
                <span
                  v-if="secret.git.drift !== 'in-sync'"
                  class="inline-flex items-center gap-1 rounded-chip border px-1.5 py-px text-[0.6875rem] font-semibold whitespace-nowrap"
                  :class="drift(secret.git.drift).classes"
                >
                  <AppIcon :name="drift(secret.git.drift).icon" :size="11" />
                  {{ drift(secret.git.drift).label }}
                </span>
              </span>
            </span>

            <!-- The contents. Names only: the values are ciphertext and are never fetched. -->
            <span class="min-w-0 font-mono text-[0.8125rem] leading-relaxed text-muted">
              <template v-if="hasKeys(secret)">
                <span
                  v-for="key in keyPreview(secret)"
                  :key="key"
                  class="mr-3 inline-block align-top"
                >{{ key }}</span>
                <span v-if="keyOverflow(secret)" class="inline-block align-top opacity-70" aria-hidden="true">+{{ keyOverflow(secret) }}</span>
                <span v-if="keyOverflow(secret)" class="sr-only">{{ keyOverflow(secret) }} more keys</span>
              </template>
              <span v-else>No keys</span>
            </span>

            <AppIcon
              name="arrow-right"
              :size="14"
              class="hidden shrink-0 self-start text-muted transition group-hover:text-accent sm:block"
            />
          </RouterLink>
        </li>
      </ul>
    </template>
  </section>
</template>
