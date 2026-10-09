<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { type IconName } from './icons'

withDefaults(defineProps<{ description: string; icon?: IconName }>(), { icon: 'namespace' })
</script>

<template>
  <div class="flex flex-col items-center gap-2 rounded-card-inner border border-dashed border-border px-6 py-10 text-center">
    <AppIcon :name="icon" :size="26" class="text-muted/70" />
    <p class="m-0 max-w-prose text-sm text-muted">{{ description }}</p>
  </div>
</template>
