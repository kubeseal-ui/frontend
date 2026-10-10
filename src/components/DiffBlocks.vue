<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/ui/AppIcon.vue'

// Flattened on purpose: one box, two panes, a rule between them. The labels are what tell
// before from after, so neither pane carries a border of its own.
const props = defineProps<{ before?: string; after: string; beforeLabel?: string; afterLabel?: string }>()

// A create has no before to compare against, so the second pane names what is about to be
// written rather than pairing with an empty one.
const afterHeading = computed(() => props.afterLabel || (props.before ? 'Encrypted after' : 'What will be written'))
</script>

<template>
  <div class="min-w-0 rounded-card-inner border border-border bg-surface-raised/70">
    <template v-if="before">
      <div class="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        <AppIcon name="lock" :size="13" />{{ beforeLabel || 'Encrypted before' }}
      </div>
      <pre class="m-0 max-h-72 overflow-auto p-3 text-xs leading-relaxed"><code class="font-mono whitespace-pre">{{ before }}</code></pre>
    </template>

    <div class="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
      <AppIcon name="lock" :size="13" />{{ afterHeading }}
    </div>
    <pre class="m-0 max-h-72 overflow-auto p-3 text-xs leading-relaxed"><code class="font-mono whitespace-pre">{{ after }}</code></pre>
  </div>
</template>
