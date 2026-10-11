<script setup lang="ts">
import AppPageFacts, { type Fact } from './AppPageFacts.vue'

// The page's statement header. A title is always a cluster identifier — a namespace, a Secret —
// so it is always monospace at page scale; the app's own names ("Namespaces", "New Secret") are
// the exception the caller passes through anyway, and they read as names too. `titleId` is a
// prop because each view points its landmark's `aria-labelledby` at it.
//
// The back link is a slot above the title, because it belongs to the header: a page you can
// leave is a fact about the page, not something floating above it.
withDefaults(
  defineProps<{
    title: string
    facts?: Fact[]
    context?: string
    titleId?: string
  }>(),
  { facts: () => [], context: '', titleId: '' },
)
</script>

<template>
  <!-- Identity left, actions right. The context under the title answers "where does a change
       here land", which is a quieter question than what the buttons do. -->
  <div class="flex items-start gap-6 px-[26px] pt-7 pb-[22px]">
    <div class="min-w-0">
      <div v-if="$slots.back" class="mb-3.5">
        <slot name="back" />
      </div>

      <h1
        :id="titleId || undefined"
        class="m-0 break-all font-mono text-3xl leading-[1.15] font-semibold tracking-[-0.025em] text-ink"
      >{{ title }}</h1>

      <slot name="facts">
        <AppPageFacts :items="facts" />
      </slot>

      <div v-if="context || $slots.context" class="mt-1.5 text-xs text-faint">
        <slot name="context">{{ context }}</slot>
      </div>
    </div>

    <div v-if="$slots.actions" class="ml-auto flex shrink-0 items-center gap-2.5">
      <slot name="actions" />
    </div>
  </div>
</template>
