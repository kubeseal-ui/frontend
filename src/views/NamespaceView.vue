<script setup lang="ts">
import { computed, ref } from 'vue'
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
import { driftPresentation } from '@/utils/drift'
import { countLabel } from '@/utils/format'

const props = defineProps<{ namespace: string }>()
const secrets = useSecretsStore()
const auth = useAuthStore()

// A usability affordance only: the server refuses an unauthorized seal independently.
const canSeal = computed(() => auth.hasCapability(props.namespace, 'secret:seal'))

function drift(status: string) {
  return driftPresentation(status)
}

// "Out of sync" covers every non-in-sync state: they all want the same thing from the
// reader, and a chip per state would put a full-width filter row before a grid of cards.
type DriftFilter = 'all' | 'in-sync' | 'out-of-sync'

interface DriftFilterChip {
  value: DriftFilter
  label: string
  icon: IconName
  classes: string
  count: number
}

const filter = ref<DriftFilter>('all')

const driftCounts = computed(() => {
  const total = secrets.secrets.length
  const inSync = secrets.secrets.filter((secret) => secret.git.drift === 'in-sync').length
  return { total, inSync, outOfSync: total - inSync }
})

// Labels, glyphs and colours come from the shared vocabulary, so a chip cannot drift
// away from the row it filters.
const filters = computed<DriftFilterChip[]>(() => [
  { value: 'all', label: 'All', icon: 'database', classes: drift('unknown').classes, count: driftCounts.value.total },
  { value: 'in-sync', label: drift('in-sync').label, icon: drift('in-sync').icon, classes: drift('in-sync').classes, count: driftCounts.value.inSync },
  { value: 'out-of-sync', label: 'Out of sync', icon: drift('diverged').icon, classes: drift('diverged').classes, count: driftCounts.value.outOfSync },
])

// One predicate for both sides, so a Secret cannot fall under neither chip nor both.
const visibleSecrets = computed(() => {
  if (filter.value === 'all') return secrets.secrets
  const wantSync = filter.value === 'in-sync'
  return secrets.secrets.filter((secret) => (secret.git.drift === 'in-sync') === wantSync)
})

const emptyFilterDescription = computed(() =>
  filter.value === 'in-sync' ? 'No SealedSecrets are in sync' : 'No SealedSecrets are out of sync')

// The rail loads the same listing, so this shares its fetch rather than asking twice.
const load = () => secrets.ensureSecrets(props.namespace).catch(() => {})
load()
</script>

<template>
  <section aria-labelledby="namespace-title">
    <RouterLink
      to="/"
      class="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent no-underline hover:underline"
    >
      <AppIcon name="chevron-left" :size="14" />
      Secrets
    </RouterLink>

    <AppPageHeader eyebrow="Namespace" :title="props.namespace" title-id="namespace-title">
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

    <p v-if="!secrets.secretsLoaded || secrets.loading" role="status" class="mb-4 flex items-center gap-2 text-sm text-muted">
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
      <!-- Real buttons with aria-pressed, so the state is announced and keyboard-
           reachable, and selection is not colour alone. -->
      <div class="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter by drift">
        <button
          v-for="chip in filters"
          :key="chip.value"
          type="button"
          class="inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-chip border px-2.5 py-1 text-xs font-semibold transition"
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

      <!-- border-t rows rather than a card each: the redraw keeps one card-level surface per
           screen, and on this screen it is the rail. -->
      <ul v-else class="m-0 list-none border-t border-border p-0" aria-label="SealedSecrets">
        <li v-for="secret in visibleSecrets" :key="secret.name" class="border-b border-border">
          <RouterLink
            :to="`/secrets/${encodeURIComponent(props.namespace)}/${encodeURIComponent(secret.name)}`"
            class="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-3 no-underline"
          >
            <AppIcon name="key" :size="16" class="shrink-0 text-accent" />
            <h2 class="m-0 min-w-0 flex-1 truncate font-mono text-sm font-semibold text-ink">{{ secret.name }}</h2>
            <span class="text-sm text-muted">{{ countLabel(secret.key_count, 'key') }} · {{ secret.scope || 'strict' }} scope</span>
            <span
              class="inline-flex items-center gap-1 whitespace-nowrap rounded-chip border px-2 py-0.5 text-xs font-semibold"
              :class="drift(secret.git.drift).classes"
            >
              <AppIcon :name="drift(secret.git.drift).icon" :size="12" />
              {{ drift(secret.git.drift).label }}
            </span>
          </RouterLink>
        </li>
      </ul>
    </template>
  </section>
</template>
