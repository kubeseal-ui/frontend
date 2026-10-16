<script setup lang="ts">
// A compact progress rail for the workflow: it names the stages and marks where the operator is, so the
// one changing button at the foot of the page is not the only thing saying how far along they are. The
// one stop the parent marks `back` is also a link home, and it is dressed as the app's own way back —
// accent text underlined on hover, not a rail label — because it is the only control on the rail and has
// to read as one. Everything else here is state.
//
// Both parts of a stop are state, so both morph on the base step rather than the pointer step: the
// connector is a wiped-in overlay rather than a colour swap, and the mark's ring and fill move
// together. Going back reverses both, so a rewind reads as the same move run backwards.
defineProps<{ steps: { key: string; label: string; back?: boolean }[]; active: number }>()
const emit = defineEmits<{ navigate: [key: string] }>()
</script>

<template>
  <!-- On a phone the four stops do not fit one width: the nav sizes to its content and scrolls
       sideways, scrollbar hidden, rather than wrapping into two half-steps. -->
  <nav aria-label="Workflow progress" class="flex w-max max-w-full items-center overflow-x-auto no-scrollbar">
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
