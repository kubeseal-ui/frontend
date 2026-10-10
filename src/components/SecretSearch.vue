<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { describeError } from '@/api'
import { useSecretsStore } from '@/stores/secrets'
import { useUiStore } from '@/stores/ui'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const secrets = useSecretsStore()
const ui = useUiStore()
const box = ref<HTMLInputElement | null>(null)

// A whole cross-namespace listing, so it is built on first use rather than on every page load.
async function loadIndex() {
  try {
    await secrets.fetchIndex()
  } catch {
    // Rendered below; the rail must not take the route down with it.
  }
}

// The header's search control opens the drawer, and focusing the box is what it asked for.
watch(
  () => ui.searchRequests,
  async () => {
    if (!secrets.indexLoaded) await loadIndex()
    await nextTick()
    box.value?.focus()
  },
)

onMounted(() => {
  if (props.modelValue) loadIndex()
})

// The index is as wide as the caller's access: namespaces without metadata:read are dropped
// server-side, so this counts what was returned rather than what exists.
const namespacesIndexed = computed(() => new Set(secrets.index.map((secret) => secret.namespace)).size)
</script>

<template>
  <div class="border-t border-border px-2 py-2">
    <label for="secret-search" class="sr-only">Search Secrets and key names</label>
    <div class="flex items-center gap-1">
      <AppIcon name="search" :size="14" class="shrink-0 text-muted" />
      <input
        id="secret-search"
        ref="box"
        :value="modelValue"
        type="search"
        placeholder="Search Secrets and keys"
        autocomplete="off"
        spellcheck="false"
        class="field min-w-0 flex-1"
        @focus="secrets.indexLoaded || loadIndex()"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <button
        type="button"
        :aria-label="secrets.indexLoading ? 'Refreshing the search index' : 'Refresh the search index'"
        :disabled="secrets.indexLoading"
        class="cursor-pointer rounded-chip border border-border p-1 text-muted hover:text-ink disabled:opacity-60"
        @click="loadIndex"
      >
        <AppIcon name="refresh" :size="12" />
      </button>
    </div>
    <p v-if="secrets.indexError" class="mt-1 mb-0 text-xs text-danger">
      {{ describeError(secrets.indexError, 'The search index could not be loaded') }}
    </p>
    <p v-else-if="secrets.indexLoading" class="mt-1 mb-0 text-xs text-muted">Building the search index…</p>
    <p v-else-if="secrets.indexLoaded && secrets.namespaces.length" class="mt-1 mb-0 text-xs text-muted">
      Indexed {{ namespacesIndexed }}/{{ secrets.namespaces.length }} namespaces
    </p>
  </div>
</template>
