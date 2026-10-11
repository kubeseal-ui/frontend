<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { describeError } from '@/api'
import { useSecretsStore } from '@/stores/secrets'
import { driftPresentation } from '@/utils/drift'
import { countLabel } from '@/utils/format'
import { highlightSegments, searchSecrets, type SearchHit } from '@/utils/searchIndex'

// What the strip shows instead of the route. It replaces the page rather than sitting over it,
// which is why the query lives in AppShell: the route stays mounted underneath and keeps whatever
// the operator had staged.
const props = defineProps<{ query: string }>()
const secrets = useSecretsStore()

const hits = computed(() => searchSecrets(secrets.index, props.query))

// Grouped by namespace, because that is the axis the operator thinks in: a hit is "payments /
// api", not a bare "api" — the same name exists in more than one namespace often enough.
const groups = computed(() => {
  const byNamespace = new Map<string, SearchHit[]>()
  for (const hit of hits.value) {
    const rows = byNamespace.get(hit.namespace)
    if (rows) rows.push(hit)
    else byNamespace.set(hit.namespace, [hit])
  }
  return [...byNamespace].map(([namespace, rows]) => ({ namespace, rows }))
})

const namespaceCount = computed(() => groups.value.length)

const status = computed<'error' | 'loading' | 'empty' | 'results'>(() => {
  if (secrets.indexError) return 'error'
  // Not loaded and not failed means the listing is still coming: the strip asks for it as soon as
  // there is a query, so this is where the first keystroke lands.
  if (!secrets.indexLoaded) return 'loading'
  return hits.value.length ? 'results' : 'empty'
})

const retry = () => secrets.fetchIndex().catch(() => {
  // The panel below renders the failure; this only stops it leaving as a rejection.
})
</script>

<template>
  <section aria-labelledby="search-results-title">
    <h1 id="search-results-title" class="sr-only">Search results</h1>

    <p v-if="status === 'loading'" role="status" class="m-0 text-sm text-muted">Building the search index…</p>

    <!-- The label names the failure and the server's detail follows it. The store only ever holds
         an Error, so a fallback alone would never render and the operator would read a bare
         message like "gateway" with nothing saying what failed. -->
    <div v-else-if="status === 'error'" class="flex flex-col items-start gap-2">
      <p class="m-0 text-sm text-danger">
        The search index could not be loaded. {{ describeError(secrets.indexError, 'No detail was reported.') }}
      </p>
      <AppButton icon="refresh" @click="retry">Try again</AppButton>
    </div>

    <p v-else-if="status === 'empty'" role="status" class="m-0 text-sm text-muted">
      No Secret or key matches “{{ props.query.trim() }}”.
    </p>

    <template v-else>
      <p role="status" class="mt-0 mb-4 text-sm text-muted">
        {{ countLabel(hits.length, 'SealedSecret') }} in {{ countLabel(namespaceCount, 'namespace') }}
      </p>

      <div v-for="group in groups" :key="group.namespace" class="mb-6 last:mb-0">
        <h2 class="m-0 mb-1 font-mono text-[0.8125rem] font-semibold text-ink">{{ group.namespace }}</h2>

        <ul class="m-0 list-none border-t border-border p-0">
          <li v-for="hit in group.rows" :key="hit.name" class="border-b border-border">
            <RouterLink
              :to="`/secrets/${encodeURIComponent(hit.namespace)}/${encodeURIComponent(hit.name)}`"
              class="group flex flex-wrap items-center gap-x-4 gap-y-1 border-l-2 py-2.5 pr-2 pl-3 no-underline transition hover:bg-surface-raised focus-visible:bg-surface-raised"
              :class="driftPresentation(hit.drift).gutter"
            >
              <!-- The name a cluster holds, at the size a name deserves. The matched run is marked
                   so a row says why it is in the list without a sentence explaining itself. -->
              <span class="min-w-0 flex-1 truncate font-mono text-sm text-ink">
                <template v-for="(segment, index) in highlightSegments(hit.name, props.query)" :key="index">
                  <mark v-if="segment.hit" class="bg-transparent font-semibold text-accent">{{ segment.text }}</mark>
                  <template v-else>{{ segment.text }}</template>
                </template>
              </span>

              <!-- The key names are here and nowhere else on a list: a search is a question the
                   operator asked, not an inventory they were handed. -->
              <span v-if="hit.matchedKeys.length" class="hidden min-w-0 shrink-0 font-mono text-xs text-muted sm:block">
                <template v-for="(key, index) in hit.matchedKeys.slice(0, 3)" :key="key">
                  <span v-if="index > 0" class="px-1 text-faint" aria-hidden="true">·</span>{{ key }}
                </template>
                <span v-if="hit.matchedKeys.length > 3" class="pl-1">+{{ hit.matchedKeys.length - 3 }}</span>
              </span>

              <span class="shrink-0 text-xs text-muted tabular-nums">{{ countLabel(hit.key_count, 'key') }}</span>

              <span
                v-if="hit.drift !== 'in-sync'"
                class="inline-flex shrink-0 items-center gap-1 rounded-chip border px-1.5 py-px text-[0.6875rem] font-semibold whitespace-nowrap"
                :class="driftPresentation(hit.drift).classes"
              >
                <AppIcon :name="driftPresentation(hit.drift).icon" :size="11" />
                {{ driftPresentation(hit.drift).label }}
              </span>

              <AppIcon name="arrow-right" :size="14" class="shrink-0 text-muted transition group-hover:text-accent" />
            </RouterLink>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>
