<script setup lang="ts">
import { ICONS, type IconName } from './icons'

// No fallback branch for an unknown name: `IconName` makes it a compile error, and a
// runtime fallback would only hide a regression `vue-tsc` already catches. Icons here are
// decorative — each accompanies a text label — so the svg is `aria-hidden`.
withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 18 })
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
    class="shrink-0"
  >
    <path v-for="(d, index) in ICONS[name]" :key="index" :d="d" />
  </svg>
</template>
