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
  // Escape clears the query before it blurs: the first press is "show me the page again", and
  // blurring alone would leave the results on screen with nothing focused to say why.
  if (event.key === 'Escape' && document.activeElement === box.value && props.modelValue) {
    emit('update:modelValue', '')
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="relative min-w-0">
    <label for="secret-search" class="sr-only">Search Secrets and key names</label>
    <AppIcon
      name="search"
      :size="14"
      class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted"
    />
    <!-- Written longhand rather than through the `field` utility: this box needs its own padding
         to clear the glyph and the shortcut hint, and two utilities on the same property are
         resolved by stylesheet order rather than by the order they appear here. -->
    <input
      id="secret-search"
      ref="box"
      :value="modelValue"
      type="search"
      placeholder="Search Secrets and keys"
      autocomplete="off"
      spellcheck="false"
      class="h-9 w-full rounded-control border border-border-strong bg-bg pr-16 pl-8 text-sm text-ink placeholder:text-muted"
      @focus="ensureIndex"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button
      v-if="modelValue"
      type="button"
      aria-label="Clear the search"
      class="absolute top-1/2 right-1.5 -translate-y-1/2 cursor-pointer rounded-mini border-0 bg-transparent p-1 text-muted hover:text-ink"
      @click="emit('update:modelValue', '')"
    >
      <AppIcon name="x" :size="12" />
    </button>
    <!-- Decorative: it states a shortcut, and the shortcut works whether or not it is read. -->
    <kbd
      v-else
      aria-hidden="true"
      class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-mini border border-border px-1 font-sans text-[0.6875rem] text-faint select-none"
    >⌘K</kbd>
  </div>
</template>
