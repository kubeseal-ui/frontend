<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
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
const router = useRouter()
const secrets = useSecretsStore()
const auth = useAuthStore()
const loaded = ref(false)

// A usability affordance only: the server refuses an unauthorized seal independently.
const canSeal = computed(() => auth.hasCapability(props.namespace, 'secret:seal'))

function createSecret() {
  router.push(`/namespaces/${encodeURIComponent(props.namespace)}/new`)
}

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
// away from the card it filters.
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

async function load() {
  loaded.value = false
  try {
    await secrets.fetchSecrets(props.namespace)
  } finally {
    loaded.value = true
  }
}

onMounted(load)
</script>

<template>
  <section aria-labelledby="namespace-title">
    <RouterLink
      to="/"
      class="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent no-underline hover:underline"
    >
      <AppIcon name="chevron-left" :size="14" />
      Namespaces
    </RouterLink>

    <AppPageHeader eyebrow="Namespace" :title="props.namespace" title-id="namespace-title">
      <template #actions>
        <AppButton v-if="canSeal" variant="primary" icon="plus" @click="createSecret">Create new Secret</AppButton>
        <AppButton icon="refresh" @click="load">Refresh</AppButton>
      </template>
    </AppPageHeader>

    <p v-if="!loaded || secrets.loading" role="status" class="mb-4 flex items-center gap-2 text-sm text-muted">
      <AppSpinner :size="15" />
      Loading secrets…
    </p>

    <div v-if="secrets.error" class="grid gap-2 rounded-card-inner border border-danger bg-surface/60 p-4" role="alert">
      <strong>Unable to load secrets.</strong>
      <p class="mb-1 text-muted">{{ describeError(secrets.error, 'Unable to load secrets') }}</p>
      <AppButton @click="load">Try again</AppButton>
    </div>

    <AppEmpty
      v-else-if="loaded && !secrets.loading && secrets.secrets.length === 0"
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

      <ul v-else class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4" aria-label="SealedSecrets">
        <li v-for="secret in visibleSecrets" :key="secret.name">
          <AppCard class="group">
            <RouterLink
              :to="`/secrets/${encodeURIComponent(props.namespace)}/${encodeURIComponent(secret.name)}`"
              class="absolute inset-0 z-10 rounded-card-inner"
            >
              <span class="sr-only">{{ secret.name }}</span>
            </RouterLink>

            <div class="flex h-full flex-col gap-1">
              <h2 class="mb-0 flex min-h-[2.5em] items-start gap-2 text-[1.05rem] leading-tight">
                <AppIcon name="key" :size="16" class="mt-1 text-accent" />
                <span class="min-w-0 break-words">{{ secret.name }}</span>
              </h2>
              <div class="mt-auto flex flex-wrap items-center justify-between gap-2">
                <span class="text-sm text-muted">{{ countLabel(secret.key_count, 'key') }} · {{ secret.scope || 'strict' }} scope</span>
                <span
                  class="inline-flex items-center gap-1 whitespace-nowrap rounded-chip border px-2 py-0.5 text-xs font-semibold"
                  :class="drift(secret.git.drift).classes"
                >
                  <AppIcon :name="drift(secret.git.drift).icon" :size="12" />
                  {{ drift(secret.git.drift).label }}
                </span>
              </div>
            </div>
          </AppCard>
        </li>
      </ul>
    </template>
  </section>
</template>
