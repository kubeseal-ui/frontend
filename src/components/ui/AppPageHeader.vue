<script setup lang="ts">
import AppPageFacts, { type Fact } from './AppPageFacts.vue'

// The page's statement header: a title is always a cluster identifier, so it is monospace at page scale. `titleId` is a prop because each view points its landmark's `aria-labelledby` at it.
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
  <!-- Identity left, actions right; the context under the title answers the quieter "where does a change here land". -->
  <div class="page-x flex items-start gap-6 pt-7 pb-[22px] max-sm:flex-wrap max-sm:gap-y-2">
    <div class="min-w-0">
      <div v-if="$slots.back" class="mb-3.5">
        <slot name="back" />
      </div>

      <!-- A cluster identifier can be one long token, so the phone keeps the wrap and drops the forced break. -->
      <h1
        :id="titleId || undefined"
        class="m-0 break-all font-mono text-3xl leading-[1.15] font-semibold tracking-[-0.025em] text-ink max-sm:break-normal"
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
