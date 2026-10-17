<script setup lang="ts">
import { ICONS, type IconName } from './icons'

// No fallback for an unknown name: `IconName` makes it a compile error, and icons are decorative here so the svg is `aria-hidden`.
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
