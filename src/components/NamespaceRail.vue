<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppIcon from '@/components/ui/AppIcon.vue'
import SecretSearch from '@/components/SecretSearch.vue'
import { useSecretsStore } from '@/stores/secrets'
import { useUiStore } from '@/stores/ui'
import { driftPresentation } from '@/utils/drift'
import { searchSecrets } from '@/utils/searchIndex'
import type { SealedSecretSummary } from '@/types'

const route = useRoute()
const secrets = useSecretsStore()
const ui = useUiStore()

const query = ref('')
const hits = computed(() => searchSecrets(secrets.index, query.value))
const active = computed(() => String(route.params.namespace ?? ''))
const currentName = computed(() => String(route.params.name ?? ''))

// Announced as the query is typed. "Searching…" while the index is in flight, and nothing at all
// for an index that is not held: the count of a listing that failed or was never asked for is not
// zero, it is unknown, and the box below is where the failure is stated.
const resultLabel = computed(() => {
  if (secrets.indexLoading) return 'Searching…'
  if (!secrets.indexLoaded) return ''
  return `${hits.value.length} ${hits.value.length === 1 ? 'match' : 'matches'}`
})

const drift = (secret: SealedSecretSummary) => driftPresentation(secret.git?.drift || 'unknown')

// Only the active namespace's Secrets are loaded. Another namespace's list is one navigation away,
// which is what keeps the rail to a single listing request.
const childrenOf = (namespace: string) => (namespace === active.value ? secrets.secrets : [])

const secretPath = (namespace: string, name: string) =>
  `/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`

watch(
  active,
  (namespace) => {
    if (!namespace) return
    // Reported by the page that owns the route; the rail must not fail the route it sits beside.
    secrets.ensureSecrets(namespace).catch(() => {})
  },
  { immediate: true },
)

// A drawer left open over the next page is an obstruction on a small screen.
watch(() => route.fullPath, () => ui.closeRail())

onMounted(() => {
  if (secrets.namespaces.length === 0) secrets.fetchNamespaces().catch(() => {})
})
</script>

<template>
  <nav aria-label="SealedSecrets" class="flex min-h-0 flex-1 flex-col">
    <div class="min-h-0 flex-1 overflow-y-auto py-1">
      <template v-if="query.trim()">
        <p class="m-0 px-2 py-1 text-xs text-muted" role="status">{{ resultLabel }}</p>
        <ul v-if="hits.length" class="m-0 list-none p-0">
          <li v-for="hit in hits" :key="`${hit.namespace}/${hit.name}`">
            <RouterLink :to="secretPath(hit.namespace, hit.name)" class="block px-2 py-1 no-underline">
              <span class="flex items-center gap-1.5">
                <span class="truncate font-mono text-xs text-ink">{{ hit.name }}</span>
                <span class="ml-auto shrink-0 text-xs text-muted">{{ hit.key_count }}</span>
              </span>
              <span class="block truncate text-xs text-muted">{{ hit.namespace }}</span>
              <span v-if="hit.matchedKeys.length" class="block truncate font-mono text-xs text-accent">
                {{ hit.matchedKeys.join(', ') }}
              </span>
            </RouterLink>
          </li>
        </ul>
        <p v-else-if="secrets.indexLoaded" class="m-0 px-2 py-1 text-xs text-muted">No Secret or key matches.</p>
      </template>

      <p v-else-if="secrets.namespaces.length === 0" class="m-0 px-2 py-1 text-xs text-muted">
        No authorized namespaces
      </p>

      <ul v-else class="m-0 list-none p-0">
        <li v-for="namespace in secrets.namespaces" :key="namespace.name">
          <!-- The fill, not just the accent text: the row you are in has to be findable in a
               column of twenty, and accent text alone sits at the same weight as the others. -->
          <RouterLink
            :to="`/namespaces/${encodeURIComponent(namespace.name)}`"
            :aria-current="namespace.name === active ? 'page' : undefined"
            class="flex items-center gap-1.5 rounded-chip px-2 py-2 text-sm no-underline lg:py-1"
            :class="namespace.name === active ? 'bg-surface-raised font-semibold text-accent' : 'text-muted hover:text-ink'"
          >
            <AppIcon :name="namespace.name === active ? 'chevron-down' : 'namespace'" :size="12" class="shrink-0" />
            <span class="truncate">{{ namespace.name }}</span>
          </RouterLink>

          <ul v-if="namespace.name === active && childrenOf(namespace.name).length" class="m-0 list-none p-0">
            <li v-for="secret in childrenOf(namespace.name)" :key="secret.name">
              <RouterLink
                :to="secretPath(namespace.name, secret.name)"
                class="flex items-center gap-1.5 py-2 pr-2 pl-6 text-xs no-underline lg:py-1"
                :class="secret.name === currentName ? 'font-semibold text-ink' : 'text-muted hover:text-ink'"
              >
                <span class="truncate font-mono">{{ secret.name }}</span>
                <span class="ml-auto shrink-0">{{ secret.key_count }}</span>
                <span class="shrink-0" :class="drift(secret).classes">
                  <AppIcon :name="drift(secret).icon" :size="11" />
                  <span class="sr-only">{{ drift(secret).label }}</span>
                </span>
              </RouterLink>
            </li>
          </ul>
        </li>
      </ul>
    </div>

    <SecretSearch v-model="query" />
  </nav>
</template>
