<script setup lang="ts">
import { ICONS, type IconName } from './icons'

/**
 * Renders one glyph from the set in ./icons.ts.
 *
 * The prop is typed as `IconName`, a union of the record's keys, so a name that
 * is not in the set fails `vue-tsc` instead of quietly producing an empty
 * `<svg>`. There is deliberately no fallback branch: the type makes the miss
 * impossible, and a runtime default would only hide a regression the compiler
 * already catches.
 *
 * Icons are always decorative here: each one accompanies a text label, so the
 * svg is `aria-hidden`. An icon that ever has to carry meaning on its own needs
 * an accessible name on its owner — which is exactly what AppShell's theme
 * buttons do, their label living on the button rather than in a child text node.
 */
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
