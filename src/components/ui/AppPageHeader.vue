<script setup lang="ts">
// `titleId` is a prop because each view points its landmark's `aria-labelledby` at it.
withDefaults(defineProps<{ title: string; eyebrow?: string; subtitle?: string; titleId?: string }>(), {
  eyebrow: '',
  subtitle: '',
  titleId: '',
})
</script>

<template>
  <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div class="min-w-0">
      <div v-if="eyebrow || $slots.eyebrow" class="mb-1.5">
        <slot name="eyebrow">
          <p class="m-0 text-xs font-bold uppercase tracking-[0.1em] text-accent">{{ eyebrow }}</p>
        </slot>
      </div>

      <h1 :id="titleId || undefined" class="m-0 text-[clamp(1.8rem,4vw,2.5rem)] tracking-tight">{{ title }}</h1>

      <div v-if="subtitle || $slots.subtitle" class="mt-1 text-muted">
        <slot name="subtitle">{{ subtitle }}</slot>
      </div>
    </div>

    <div v-if="$slots.actions" class="flex flex-wrap items-center justify-end gap-2">
      <slot name="actions" />
    </div>
  </div>
</template>
