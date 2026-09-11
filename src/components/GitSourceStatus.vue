<script lang="ts" setup>
import type { PropType } from 'vue'

interface Props {
  managed: boolean
  drift: 'in-sync' | 'diverged' | 'unknown'
  file_path?: string
}

defineProps<Props>()
</script>

<template>
  <div class="text-sm text-gray-600">
    <span v-if="managed">Git-managed • </span>
    <span :class="{ 'text-red-600': drift === 'diverged', 'text-green-600': drift === 'in-sync' }">
      {{ drift }}
    </span>
    <span v-if="file_path" class="block text-xs text-gray-500">{{ file_path }}</span>
  </div>
</template>