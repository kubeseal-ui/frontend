<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { describeError } from '@/api'
import { useSecretsStore } from '@/stores/secrets'
import { useUiStore } from '@/stores/ui'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const secrets = useSecretsStore()
const ui = useUiStore()
const box = ref<HTMLInputElement | null>(null)

// The refresh button's deliberate repeat: the one caller that asks again for a listing we hold.
async function loadIndex() {
  try {
    await secrets.fetchIndex()
  } catch {
    // Rendered below; the rail must not take the route down with it.
  }
}

// A whole cross-namespace listing, so it is built on first use rather than on every page load.
function ensureIndex() {
  // A query arrives one keystroke at a time and every one of them wants the same request, so an
  // index already held — or already in flight — is not asked for again.
  if (secrets.indexLoaded || secrets.indexLoading) return
  return loadIndex()
}

// The header's search control opens the drawer, and focusing the box is what it asked for.
watch(
  () => ui.searchRequests,
  async () => {
    await ensureIndex()
    await nextTick()
    box.value?.focus()
  },
)

// Typing is asking for the index. A query can reach the box before it is ever focused — restored
// or set programmatically — and answering that from an index nobody requested reads "No Secret or
// key matches." off a listing that was never made.
watch(() => props.modelValue, (query) => { if (query.trim()) ensureIndex() }, { immediate: true })

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
        @focus="ensureIndex"
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
    <!-- The label names the failure and the server's detail follows it. The store only ever holds
         an Error, so a fallback alone would never render and the operator would read a bare
         message like "gateway" with nothing saying what failed. -->
    <p v-if="secrets.indexError" class="mt-1 mb-0 text-xs text-danger">
      The search index could not be loaded. {{ describeError(secrets.indexError, 'No detail was reported.') }}
    </p>
    <p v-else-if="secrets.indexLoading" class="mt-1 mb-0 text-xs text-muted">Building the search index…</p>
    <p v-else-if="secrets.indexLoaded && secrets.namespaces.length" class="mt-1 mb-0 text-xs text-muted">
      Indexed {{ namespacesIndexed }}/{{ secrets.namespaces.length }} namespaces
    </p>
  </div>
</template>
