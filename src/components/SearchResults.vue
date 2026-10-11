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

    <p v-if="status === 'loading'" role="status" class="m-0 px-[26px] pt-[18px] text-[12.5px] text-muted">Searching…</p>

    <!-- The label names the failure and the server's detail follows it. The store only ever holds
         an Error, so a fallback alone would never render and the operator would read a bare
         message like "gateway" with nothing saying what failed. -->
    <div v-else-if="status === 'error'" class="flex flex-col items-start gap-2 px-[26px] pt-[18px]">
      <p class="m-0 text-[12.5px] text-danger">
        The search index could not be loaded. {{ describeError(secrets.indexError, 'No detail was reported.') }}
      </p>
      <AppButton icon="refresh" @click="retry">Try again</AppButton>
    </div>

    <p v-else-if="status === 'empty'" role="status" class="m-0 px-[26px] pt-[18px] text-[12.5px] text-muted">
      No Secret or key matches “{{ props.query.trim() }}”.
    </p>

    <template v-else>
      <!-- What was searched, because the answer spans namespaces and the strip gives no sign of
           that on its own. -->
      <p role="status" class="m-0 flex items-baseline gap-[7px] px-[26px] pt-[18px] text-[12.5px] text-muted">
        <em class="font-mono font-[650] not-italic text-ink">{{ hits.length }}</em>
        {{ hits.length === 1 ? 'match' : 'matches' }} in
        <em class="font-mono font-[650] not-italic text-ink">{{ namespaceCount }}</em>
        {{ namespaceCount === 1 ? 'namespace' : 'namespaces' }} · searched Secret names and key names
      </p>

      <div v-for="group in groups" :key="group.namespace">
        <div class="flex items-baseline gap-2.5 px-[26px] pt-[22px] pb-[7px]">
          <h2 class="m-0 font-mono text-[13.5px] font-[650] text-ink">{{ group.namespace }}</h2>
          <span class="text-[11.5px] text-faint">{{ countLabel(group.rows.length, 'match', 'matches') }}</span>
        </div>

        <RouterLink
          v-for="hit in group.rows"
          :key="hit.name"
          :to="`/secrets/${encodeURIComponent(hit.namespace)}/${encodeURIComponent(hit.name)}`"
          class="grid grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto] items-center gap-x-[22px] border-b border-border px-[26px] py-[9px] text-inherit no-underline hover:bg-surface focus-visible:bg-surface"
        >
          <span class="min-w-0">
            <!-- The query is already in the strip, so a name that matched says which part of it did. -->
            <span class="block truncate font-mono text-[14.5px] font-[550] text-ink">
              <template v-for="(segment, index) in highlightSegments(hit.name, props.query)" :key="index">
                <mark v-if="segment.hit" class="bg-transparent text-accent">{{ segment.text }}</mark>
                <template v-else>{{ segment.text }}</template>
              </template>
            </span>
            <span class="mt-0.5 block text-[11.5px] text-muted">{{ countLabel(hit.key_count, 'key') }} · {{ hit.scope === 'strict' ? 'strict' : 'namespace-wide' }}</span>
          </span>

          <!-- The key names are here and nowhere else on a list: a search is a question the
               operator asked, not an inventory they were handed. -->
          <span class="min-w-0 truncate font-mono text-xs text-accent">
            <template v-for="(key, index) in hit.matchedKeys.slice(0, 3)" :key="key">
              <span v-if="index > 0">, </span>{{ key }}
            </template>
            <span v-if="hit.matchedKeys.length > 3" class="text-faint"> +{{ hit.matchedKeys.length - 3 }} more</span>
          </span>

          <span
            class="inline-flex shrink-0 items-center gap-[5px] rounded-chip border px-1.5 py-px text-[11px] font-[650] whitespace-nowrap"
            :class="driftPresentation(hit.drift).classes"
          >
            <AppIcon :name="driftPresentation(hit.drift).icon" :size="11" />
            {{ driftPresentation(hit.drift).label }}
          </span>
        </RouterLink>
      </div>
    </template>
  </section>
</template>
