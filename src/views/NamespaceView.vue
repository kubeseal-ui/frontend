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
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'

const props = defineProps<{ namespace: string }>()
const router = useRouter()
const secrets = useSecretsStore()
const auth = useAuthStore()
const loaded = ref(false)

// Hiding the control is a usability affordance; the server refuses an
// unauthorized seal independently.
const canSeal = computed(() => auth.hasCapability(props.namespace, 'secret:seal'))

function createSecret() {
  router.push(`/namespaces/${encodeURIComponent(props.namespace)}/new`)
}

/**
 * Drift is conveyed by colour, but never by colour alone: each state also
 * carries a glyph and a word, so it survives a monochrome display, a
 * colour-blind reader, and a screen reader. The glyph is an icon rather than a
 * character because the icon set is drawn on the same optical weight as the
 * text it sits beside.
 *
 * The colour lives here as a class rather than in the stylesheet so the
 * status vocabulary and its treatment sit next to each other. Tailwind reads
 * these literals straight out of this file, which is what keeps
 * border-success/40 a real utility rather than a generated-name lookalike.
 */
const driftStates: Record<string, { icon: IconName; label: string; classes: string }> = {
  'in-sync': { icon: 'check', label: 'In sync', classes: 'text-success border-success/40' },
  diverged: { icon: 'alert', label: 'Diverged', classes: 'text-danger border-danger/40' },
  live_only: { icon: 'info', label: 'Live only', classes: 'text-warning border-warning/40' },
  'live-only': { icon: 'info', label: 'Live only', classes: 'text-warning border-warning/40' },
  git_only: { icon: 'info', label: 'Git only', classes: 'text-info border-info/40' },
  'git-only': { icon: 'info', label: 'Git only', classes: 'text-info border-info/40' },
  unknown: { icon: 'info', label: 'Unknown', classes: 'text-muted border-border' },
}

const UNKNOWN_DRIFT = { icon: 'info', label: '', classes: 'text-muted border-border' }

function drift(status: string) {
  return driftStates[status] ?? { ...UNKNOWN_DRIFT, label: status }
}

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
      <p class="mb-1 text-muted">{{ secrets.error.message }}</p>
      <AppButton @click="load">Try again</AppButton>
    </div>

    <AppEmpty
      v-else-if="loaded && !secrets.loading && secrets.secrets.length === 0"
      icon="database"
      description="No SealedSecrets in this namespace"
    />

    <ul v-else class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4" aria-label="SealedSecrets">
      <li v-for="secret in secrets.secrets" :key="secret.name">
        <!-- The link covers the card, not just its text: the card's hover
             affordance applies to the whole surface. -->
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
            <!-- mt-auto keeps the status row on one baseline across the row
                 even when a neighbouring name wraps to two lines. -->
            <div class="mt-auto flex flex-wrap items-center justify-between gap-2">
              <span class="text-sm text-muted">{{ secret.key_count }} keys · {{ secret.scope || 'strict' }}</span>
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
  </section>
</template>
