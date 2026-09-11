<script lang="ts" setup>
interface Props {
  name: string
}

defineProps<Props>()
</script>

<template>
  <div class="font-bold text-lg">
    {{ name }}
  </div>
</template>