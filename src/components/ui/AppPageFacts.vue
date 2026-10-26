<script setup lang="ts">
// Values are cluster identifiers, so they are monospace at ink; labels are the app's own words and stay in the sans.
export interface Fact {
  value?: string
  label: string
  tone?: 'danger' | 'success' | 'warning'
}

withDefaults(defineProps<{ items?: Fact[] }>(), { items: () => [] })

const TONES: Record<string, string> = {
  danger: 'text-danger',
  success: 'text-success',
  warning: 'text-warning',
}
</script>

<template>
  <div v-if="items.length" class="mt-2.5 flex flex-wrap items-center gap-2 text-[13px] text-muted">
    <template v-for="(item, index) in items" :key="item.label">
      <span v-if="index > 0" class="text-border-strong" aria-hidden="true">/</span>
      <span :class="item.tone ? `${TONES[item.tone]} font-semibold` : ''">
        <em
          v-if="item.value"
          class="font-mono font-semibold not-italic"
          :class="item.tone ? TONES[item.tone] : 'text-ink'"
        >{{ item.value }}</em>
        {{ item.label }}
      </span>
    </template>
  </div>
</template>
