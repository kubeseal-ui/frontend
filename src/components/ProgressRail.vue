<script setup lang="ts">
// A compact progress rail for the workflow: it names the stages and marks where the operator is,
// so the one changing button at the foot of the page is not the only thing saying how far along
// they are. A completed stop that the parent marks `back` is a link that steps there; the current
// and future stops, and completed stops with no way back, are plain text.
//
// Both parts of a stop are state, so both morph on the base step rather than the pointer step: the
// connector is a wiped-in overlay rather than a colour swap, and the mark's ring and fill move
// together. Going back reverses both, so a rewind reads as the same move run backwards.
defineProps<{ steps: { key: string; label: string; back?: boolean }[]; active: number }>()
const emit = defineEmits<{ navigate: [key: string] }>()
</script>

<template>
  <nav aria-label="Workflow progress" class="flex items-center">
    <template v-for="(step, i) in steps" :key="step.key">
      <span
        v-if="i"
        aria-hidden="true"
        class="rail-bar mx-2.5 h-px w-6 shrink-0"
        :class="{ done: i <= active }"
      />
      <component
        :is="i < active && step.back ? 'button' : 'span'"
        :type="i < active && step.back ? 'button' : undefined"
        class="inline-flex items-center gap-2 whitespace-nowrap text-[12.5px] font-semibold"
        :class="[
          i < active ? 'text-muted' : i === active ? 'text-ink' : 'text-faint',
          i < active && step.back ? 'cursor-pointer border-0 bg-transparent p-0 hover:text-ink hover:underline underline-offset-4' : '',
        ]"
        :aria-current="i === active ? 'step' : undefined"
        @click="i < active && step.back ? emit('navigate', step.key) : undefined"
      >
        <span
          class="rail-mark h-4 w-4 shrink-0 rounded-full border-[1.5px]"
          :class="i < active ? 'border-accent bg-accent' : i === active ? 'border-accent bg-bg ring-[3px] ring-accent/30' : 'border-border-strong bg-bg'"
        />
        {{ step.label }}
      </component>
    </template>
  </nav>
</template>
