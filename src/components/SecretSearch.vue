<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { useSecretsStore } from '@/stores/secrets'

// The strip's search control, and the owner of the ⌘K shortcut. It holds no results: the query
// is the caller's — it decides what the page below renders — and this component's whole job is
// to be the box that query is typed into.
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const secrets = useSecretsStore()
const box = ref<HTMLInputElement | null>(null)
const focused = ref(false)

// A whole cross-namespace listing, so it is built on first use rather than on every page load.
function ensureIndex() {
  // A query arrives one keystroke at a time and every one of them wants the same request, so an
  // index already held — or already in flight — is not asked for again.
  if (secrets.indexLoaded || secrets.indexLoading) return
  return secrets.fetchIndex().catch(() => {
    // Reported by the results panel, which is where a failed index is worth a sentence; the
    // strip stays a box and never takes the route down with it.
  })
}

// Typing is asking for the index. A query can reach the box before it is ever focused — restored
// or set programmatically — and answering that from an index nobody requested reads "No Secret or
// key matches." off a listing that was never made.
watch(() => props.modelValue, (query) => { if (query.trim()) ensureIndex() }, { immediate: true })

async function focus() {
  await ensureIndex()
  await nextTick()
  box.value?.focus()
}

// ⌘K on a Mac, Ctrl+K everywhere else. Registered on the window rather than on the input,
// because the whole point is that it works from wherever the operator happens to be.
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
  <!-- Capped and never wider: a box that spans a wide window stops reading as a field and starts
       reading as a banner. Focus is the whole "on" state — the accent keyline, the raised fill and
       the halo — and a query set without focus keeps it, because a strip that is answering is not
       an idle one. -->
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
    <!-- The query's own clear, drawn as the keycap it mirrors. It is a button and not a keycap,
         but it is read as one: the shortcut works whether or not it is read at all. -->
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
    >⌘K</kbd>
  </div>
</template>
