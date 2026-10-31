<script setup lang="ts">
// Names the stages and marks where the operator is. The one stop marked `back` is a link dressed as the app's way back; everything else here is state.
defineProps<{ steps: { key: string; label: string; back?: boolean }[]; active: number }>()
const emit = defineEmits<{ navigate: [key: string] }>()
</script>

<template>
  <!-- On a phone the stops size to content and scroll sideways rather than wrapping into two half-steps. -->
  <nav aria-label="Workflow progress" class="-mx-1 -my-1 flex w-max max-w-full items-center overflow-x-auto px-1 py-1 no-scrollbar">
    <template v-for="(step, i) in steps" :key="step.key">
      <span
        v-if="i"
        aria-hidden="true"
        class="rail-bar mx-1.5 h-[1.5px] w-5 shrink-0 sm:mx-2 sm:w-[30px]"
        :class="{ done: i <= active }"
      />
      <component
        :is="i < active && step.back ? 'button' : 'span'"
        :type="i < active && step.back ? 'button' : undefined"
        class="inline-flex items-center gap-[7px] whitespace-nowrap text-[12px] font-semibold"
        :class="[
          i < active ? (step.back ? 'text-accent' : 'text-muted') : i === active ? 'text-ink' : 'text-faint',
          i < active && step.back ? 'cursor-pointer border-0 bg-transparent p-0 hover:underline underline-offset-4' : '',
        ]"
        :aria-current="i === active ? 'step' : undefined"
        @click="i < active && step.back ? emit('navigate', step.key) : undefined"
      >
        <span
          class="rail-mark size-3.5 shrink-0 rounded-full border-[1.5px]"
          :class="i < active ? 'border-accent bg-accent' : i === active ? 'border-accent bg-bg ring-[3px] ring-accent/30' : 'border-border-strong bg-bg'"
        />
        {{ step.label }}
      </component>
    </template>
  </nav>
</template>
