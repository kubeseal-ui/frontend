<script setup lang="ts">
import AppIcon from './AppIcon.vue'

/**
 * The one surface. Every panel in the app is this, so the glass material is
 * applied in exactly one place and there is no second selector restating it.
 *
 * The element is a flex column that fills its container, so a card in a grid
 * row stretches to the row height and its children can pin themselves with
 * `mt-auto`. That is what keeps metadata rows aligned across a row when one
 * card's title wraps to two lines.
 */
withDefaults(defineProps<{ title?: string; icon?: string }>(), { title: '', icon: '' })
</script>

<template>
  <section class="glass flex h-full flex-col rounded-card">
    <header v-if="title || $slots.actions" class="flex items-center gap-2.5 border-b border-border px-5 py-3">
      <AppIcon v-if="icon" :name="icon" :size="18" class="text-accent" />
      <h2 v-if="title" class="m-0 text-[1rem] font-semibold tracking-tight">{{ title }}</h2>
      <div v-if="$slots.actions" class="ml-auto flex flex-wrap items-center gap-2">
        <slot name="actions" />
      </div>
    </header>

    <div class="flex flex-1 flex-col p-5">
      <slot />
    </div>
  </section>
</template>
