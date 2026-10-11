<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { type IconName } from './icons'

// A keylined panel — one border, one surface, and never a rounded container inside another. A flex column filling its
// container, so a card stretches to its grid row and children pin with `mt-auto`.
withDefaults(defineProps<{ title?: string; icon?: IconName }>(), { title: '' })
</script>

<template>
  <section class="panel flex h-full flex-col">
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
