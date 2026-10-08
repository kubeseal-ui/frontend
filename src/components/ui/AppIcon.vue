<script setup lang="ts">
/**
 * The icon set. Inline SVG, no dependency and no sprite request.
 *
 * Every glyph is expressed as path data only — circles and rounded rectangles
 * included — so the renderer is a single `v-for` over `path` elements. That
 * keeps it free of `v-html` and identical between a browser and happy-dom,
 * which matters because the component tests mount these.
 *
 * Geometry is authored on a 24x24 grid and drawn with `currentColor`, so an
 * icon takes the text colour of whatever it sits in and follows the theme with
 * no second definition.
 *
 * Icons are always decorative here: each one accompanies a text label, so the
 * svg is `aria-hidden`. An icon that ever has to carry meaning on its own needs
 * an accessible name on its owner, not on this element.
 */
const icons: Record<string, string[]> = {
  // A box: a namespace is a container, and the isometric form says that faster
  // than a folder or a grid of squares does at 18px.
  namespace: ['M12 3l9 4.5-9 4.5-9-4.5z', 'M3 7.5v9L12 21v-9', 'M21 7.5v9L12 21'],
  key: ['M19.5 8a3.5 3.5 0 1 0-7 0 3.5 3.5 0 0 0 7 0Z', 'M13.5 10.5 4 20', 'm7.5 16.5 2 2'],
  lock: [
    'M6 10h12a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z',
    'M8 10V7a4 4 0 0 1 8 0v3',
  ],
  'git-branch': [
    'M6 3v12',
    'M21 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
    'M18 9a9 9 0 0 1-9 9',
  ],
  refresh: ['M21 12a9 9 0 1 1-2.6-6.4', 'M21 4v5h-5'],
  'sign-out': ['M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3', 'M10 17l5-5-5-5', 'M15 12H3'],
  'arrow-right': ['M4 12h15', 'm13 6 6 6-6 6'],
  'chevron-left': ['M14.5 5 7.5 12l7 7'],
  plus: ['M12 5v14', 'M5 12h14'],
  check: ['M5 12.5l4.5 4.5L19 7'],
  alert: ['M12 3.5 2.5 20h19L12 3.5Z', 'M12 10v4.5', 'M12 17v.5'],
  info: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', 'M12 11v5.5', 'M12 7.5v.5'],
  x: ['m6 6 12 12', 'M18 6 6 18'],
  database: [
    'M20 6c0 1.7-3.6 3-8 3S4 7.7 4 6s3.6-3 8-3 8 1.3 8 3Z',
    'M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6',
    'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  ],
  shield: ['M12 3 5 6v6c0 4.2 2.9 7.7 7 9 4.1-1.3 7-4.8 7-9V6l-7-3Z'],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
  'eye-off': [
    'M2.5 12S6 5.5 12 5.5a10 10 0 0 1 4.3 1',
    'M21.5 12S18 18.5 12 18.5a10 10 0 0 1-4.3-1',
    'm4 4 16 16',
  ],
}

withDefaults(defineProps<{ name: string; size?: number }>(), { size: 18 })

function paths(name: string): string[] {
  return icons[name] ?? []
}
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
    <path v-for="(d, index) in paths(name)" :key="index" :d="d" />
  </svg>
</template>
