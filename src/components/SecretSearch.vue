<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { useSecretsStore } from '@/stores/secrets'

// The strip's search control and owner of the ⌘K shortcut; it holds no results — the query is the caller's, this is just the box it is typed into.
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const secrets = useSecretsStore()
const box = ref<HTMLInputElement | null>(null)
const focused = ref(false)
const searchShortcut = /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘ K' : 'Ctrl+K'

// A whole cross-namespace listing, so it is built on first use rather than on every page load.
function ensureIndex() {
  // Every keystroke wants the same request, so an index already held — or in flight — is not asked for again.
  if (secrets.indexLoaded || secrets.indexLoading) return
  return secrets.fetchIndex().catch(() => {
    // Reported by the results panel; the strip stays a box and never takes the route down with it.
  })
}

// A query can reach the box before it is ever focused, and answering from an index nobody requested reads "No Secret or key matches." off a listing never made.
watch(() => props.modelValue, (query) => { if (query.trim()) ensureIndex() }, { immediate: true })

async function focus() {
  await ensureIndex()
  await nextTick()
  box.value?.focus()
}

// ⌘ K on a Mac, Ctrl+K elsewhere; registered on the window because the point is that it works from wherever the operator is.
function onKeydown(event: KeyboardEvent) {
  const combo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
  if (combo) {
    event.preventDefault()
    focus()
    return
  }
  if (event.key === 'Escape' && document.activeElement === box.value) {
    event.preventDefault()
    emit('update:modelValue', '')
    box.value?.blur()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <!-- Capped and never wider; focus is the whole "on" state, and a query set without focus keeps it because a strip that is answering is not idle. -->
  <div
    class="flex h-[34px] min-w-0 flex-1 items-center gap-2 rounded-control border border-border pr-[9px] pl-[10px]"
    :class="
      focused || modelValue
        ? 'bg-surface-raised shadow-[0_0_0_3px_color-mix(in_srgb,var(--app-accent)_16%,transparent)]'
        : 'bg-bg'
    "
  >
    <label for="secret-search" class="sr-only">Search Secrets and key names</label>
    <AppIcon name="search" :size="14" class="pointer-events-none shrink-0 text-faint" />
    <input
      id="secret-search"
      ref="box"
      :value="modelValue"
      type="search"
      placeholder="Search any Secret or key in the cluster"
      autocomplete="off"
      spellcheck="false"
      class="min-w-0 flex-1 border-0 bg-transparent text-ink outline-none placeholder:text-faint max-sm:text-[14px]"
      :class="modelValue ? 'font-mono text-sm' : 'text-[13px]'"
      @focus="focused = true; ensureIndex()"
      @blur="focused = false"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <!-- The query's own clear, drawn as the keycap it mirrors; it is read as one. -->
    <button
      v-if="modelValue"
      type="button"
      aria-label="Clear the search"
      class="shrink-0 cursor-pointer rounded-[5px] border border-accent/40 bg-transparent px-[5px] py-px font-mono text-[11px] text-accent hover:border-accent hover:bg-accent/10"
      @click="emit('update:modelValue', ''); box?.focus()"
    >esc</button>
    <kbd
      v-else
      aria-hidden="true"
      class="pointer-events-none max-sm:hidden shrink-0 select-none rounded-[5px] border border-border-strong px-[5px] py-px font-mono text-[11px] text-faint"
    >{{ searchShortcut }}</kbd>
  </div>
</template>
