<script setup lang="ts">
// `titleId` is a prop because each view points its landmark's `aria-labelledby` at it.
//
// `mono` marks a title that IS a cluster identifier — a namespace or a Secret name — which this
// design sets in monospace at page scale. A title that is one of the app's own words stays in the
// interface's sans, and that split is the whole type rule: machine names are set as names, the
// app's own words as labels.
withDefaults(
  defineProps<{
    title: string
    eyebrow?: string
    subtitle?: string
    context?: string
    titleId?: string
    mono?: boolean
  }>(),
  { eyebrow: '', subtitle: '', context: '', titleId: '', mono: false },
)
</script>

<template>
  <!-- Identity left, configuration right — a statement header. The actions act on the page; the
       context below them answers "where does a change here land", which is a quieter question. -->
  <div class="mb-5 flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
    <div class="min-w-0">
      <div v-if="eyebrow || $slots.eyebrow" class="mb-2">
        <slot name="eyebrow">
          <p class="m-0 text-xs text-muted">{{ eyebrow }}</p>
        </slot>
      </div>

      <h1
        :id="titleId || undefined"
        class="m-0 leading-tight text-ink"
        :class="
          mono
            ? 'font-mono text-[1.875rem] font-medium tracking-[-0.01em] break-all'
            : 'text-[1.375rem] font-semibold tracking-[-0.02em]'
        "
      >{{ title }}</h1>

      <div v-if="subtitle || $slots.subtitle" class="mt-2 text-[0.8125rem] text-muted">
        <slot name="subtitle">{{ subtitle }}</slot>
      </div>
    </div>

    <div v-if="$slots.actions || context || $slots.context" class="flex flex-col items-end gap-1.5">
      <div v-if="$slots.actions" class="flex flex-wrap items-center justify-end gap-2">
        <slot name="actions" />
      </div>
      <div v-if="context || $slots.context" class="max-w-[38ch] text-right text-xs leading-snug text-muted">
        <slot name="context">{{ context }}</slot>
      </div>
    </div>
  </div>
</template>
