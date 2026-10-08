<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { NButton, NCard, NEmpty, NSpin } from 'naive-ui'
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
 * colour-blind reader, and a screen reader.
 *
 * The colour lives here as a class rather than in the stylesheet so the
 * status vocabulary and its treatment sit next to each other. Tailwind reads
 * these literals straight out of this file, which is what keeps
 * border-success/40 a real utility rather than a generated-name lookalike.
 */
const driftStates: Record<string, { glyph: string; label: string; classes: string }> = {
  'in-sync': { glyph: '✓', label: 'In sync', classes: 'text-success border-success/40' },
  diverged: { glyph: '▲', label: 'Diverged', classes: 'text-danger border-danger/40' },
  live_only: { glyph: '◆', label: 'Live only', classes: 'text-warning border-warning/40' },
  'live-only': { glyph: '◆', label: 'Live only', classes: 'text-warning border-warning/40' },
  git_only: { glyph: '◇', label: 'Git only', classes: 'text-info border-info/40' },
  'git-only': { glyph: '◇', label: 'Git only', classes: 'text-info border-info/40' },
  unknown: { glyph: '◇', label: 'Unknown', classes: 'text-muted border-border' },
}

function drift(status: string) {
  return driftStates[status] ?? { glyph: '◇', label: status, classes: 'text-muted border-border' }
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
    <RouterLink to="/" class="mb-6 inline-block font-semibold text-accent no-underline">← Namespaces</RouterLink>

    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="mb-1.5 text-xs font-bold uppercase tracking-[0.1em] text-accent">Namespace</p>
        <h1 id="namespace-title" class="mb-0 text-[clamp(1.8rem,4vw,2.5rem)] tracking-tight">{{ props.namespace }}</h1>
      </div>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <NButton v-if="canSeal" type="primary" @click="createSecret">Create new Secret</NButton>
        <NButton secondary @click="load">Refresh</NButton>
      </div>
    </div>

    <NSpin :show="!loaded || secrets.loading">
      <div v-if="secrets.error" class="grid gap-2 rounded-card-inner border border-danger bg-surface/60 p-4" role="alert">
        <strong>Unable to load secrets.</strong>
        <p class="mb-1 text-muted">{{ secrets.error.message }}</p>
        <NButton @click="load">Try again</NButton>
      </div>

      <NEmpty v-else-if="secrets.secrets.length === 0" description="No SealedSecrets in this namespace" />

      <ul v-else class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4" aria-label="SealedSecrets">
        <li v-for="secret in secrets.secrets" :key="secret.name">
          <!-- The link covers the card, not just its text: NCard's hover
               affordance applies to the whole surface. -->
          <NCard class="glass group h-full" hoverable>
            <RouterLink
              :to="`/secrets/${encodeURIComponent(props.namespace)}/${encodeURIComponent(secret.name)}`"
              class="absolute inset-0 z-10 rounded-card-inner"
            >
              <span class="sr-only">{{ secret.name }}</span>
            </RouterLink>

            <div class="flex h-full flex-col gap-1">
              <h2 class="mb-0 min-h-[2.5em] break-words text-[1.05rem] leading-tight">{{ secret.name }}</h2>
              <!-- mt-auto keeps the status row on one baseline across the row
                   even when a neighbouring name wraps to two lines. -->
              <div class="mt-auto flex items-center justify-between gap-2">
                <span class="text-sm text-muted">{{ secret.key_count }} keys · {{ secret.scope || 'strict' }}</span>
                <span
                  class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip border px-2 py-0.5 text-xs font-semibold"
                  :class="drift(secret.git.drift).classes"
                >
                  <span aria-hidden="true" class="text-[0.8em] leading-none">{{ drift(secret.git.drift).glyph }}</span>
                  {{ drift(secret.git.drift).label }}
                </span>
              </div>
            </div>
          </NCard>
        </li>
      </ul>
    </NSpin>
  </section>
</template>
