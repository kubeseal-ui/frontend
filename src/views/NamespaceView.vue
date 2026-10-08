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
 * Drift is conveyed by colour in the stylesheet, but never by colour alone:
 * each state also carries a glyph and a word, so it survives a monochrome
 * display, a colour-blind reader, and a screen reader.
 */
const driftLabels: Record<string, { glyph: string; label: string }> = {
  'in-sync': { glyph: '✓', label: 'In sync' },
  diverged: { glyph: '▲', label: 'Diverged' },
  live_only: { glyph: '◆', label: 'Live only' },
  'live-only': { glyph: '◆', label: 'Live only' },
  git_only: { glyph: '◇', label: 'Git only' },
  'git-only': { glyph: '◇', label: 'Git only' },
  unknown: { glyph: '◇', label: 'Unknown' },
}

function driftBadge(status: string) {
  return driftLabels[status] ?? { glyph: '◇', label: status }
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
    <RouterLink to="/" class="back-link">← Namespaces</RouterLink>
    <div class="page-heading">
      <div>
        <p class="eyebrow">Namespace</p>
        <h1 id="namespace-title">{{ props.namespace }}</h1>
      </div>
      <div class="heading-actions">
        <NButton v-if="canSeal" type="primary" @click="createSecret">Create new Secret</NButton>
        <NButton secondary @click="load">Refresh</NButton>
      </div>
    </div>

    <NSpin :show="!loaded || secrets.loading">
      <div v-if="secrets.error" class="state-panel error-panel" role="alert">
        <strong>Unable to load secrets.</strong>
        <p>{{ secrets.error.message }}</p>
        <NButton @click="load">Try again</NButton>
      </div>
      <NEmpty v-else-if="secrets.secrets.length === 0" description="No SealedSecrets in this namespace" />
      <div v-else class="secret-list" aria-label="SealedSecrets">
        <NCard v-for="secret in secrets.secrets" :key="secret.name" class="glass-blur" hoverable>
          <RouterLink :to="`/secrets/${encodeURIComponent(props.namespace)}/${encodeURIComponent(secret.name)}`" class="card-link">
            <div class="secret-row">
              <div>
                <h2>{{ secret.name }}</h2>
                <p>{{ secret.key_count }} keys · {{ secret.scope || 'strict' }}</p>
              </div>
              <span class="status-badge" :data-status="secret.git.drift">
                <span class="badge-glyph" aria-hidden="true">{{ driftBadge(secret.git.drift).glyph }}</span>
                {{ driftBadge(secret.git.drift).label }}
              </span>
            </div>
          </RouterLink>
        </NCard>
      </div>
    </NSpin>
  </section>
</template>
