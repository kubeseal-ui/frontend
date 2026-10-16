<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useSecretsStore } from '@/stores/secrets'

// The sibling namespaces, as one scrolling line. It replaces the rail: a namespace is a place you
// move between, and a rail spent a column of every screen saying so.
defineProps<{ namespace: string }>()
const secrets = useSecretsStore()
// Two listings, both shared with the pages either side of this one: the namespace listing names
// the siblings, and the search index is the only response that knows whether one of them drifted.
// A deep link into this page is what makes them worth asking for at all.
onMounted(() => {
  if (secrets.namespaces.length === 0 && !secrets.loading) secrets.fetchNamespaces().catch(() => {})
  if (secrets.indexLoaded || secrets.indexLoading) return
  secrets.fetchIndex().catch(() => {
    // A missing dot is a quieter failure than a broken switcher, so the strip draws what it has.
  })
})

const names = computed(() => {
  const all = new Set(secrets.namespaces.map((item) => item.name))
  for (const entry of secrets.index) all.add(entry.namespace)
  return [...all].sort((a, b) => a.localeCompare(b))
})

const drifted = computed(() => {
  const out = new Set<string>()
  for (const entry of secrets.index) {
    if (entry.git?.drift && entry.git.drift !== 'in-sync') out.add(entry.namespace)
  }
  return out
})

const strip = ref<HTMLElement | null>(null)
// The names arrive after the strip mounts, so a deep link can land with the active chip
// offscreen in the scroll line; bring it into view once the listing lands.
watch(names, async (list) => {
  if (!list.length) return
  await nextTick()
  strip.value?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' })
}, { immediate: true })
</script>

<template>
  <nav
    v-if="names.length > 1"
    ref="strip"
    class="page-x flex gap-1 overflow-x-auto border-b border-border pb-3"
    aria-label="Namespaces"
  >
    <RouterLink
      v-for="name in names"
      :key="name"
      :to="`/namespaces/${name}`"
      :aria-current="name === namespace ? 'page' : undefined"
      class="shrink-0 rounded-mini border px-[11px] py-[5px] max-sm:inline-flex max-sm:items-center max-sm:h-10 font-mono text-xs no-underline"
      :class="
        name === namespace
          ? 'border-border-strong bg-surface-raised font-semibold text-accent'
          : 'border-transparent text-muted hover:bg-surface-raised hover:text-ink'
      "
    >{{ name }}<span
      v-if="drifted.has(name)"
      aria-hidden="true"
      class="ml-1.5 inline-block size-[5px] rounded-full bg-danger align-middle"
    /></RouterLink>
  </nav>
</template>
