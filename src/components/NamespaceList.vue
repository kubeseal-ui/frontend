<script lang="ts" setup>
import type { Namespace } from '@/types'
import { RouterLink } from 'vue-router'

interface Props {
  namespaces: Namespace[]
}

const props = defineProps<Props>()
</script>

<template>
  <div class="space-y-2">
    <div v-if="props.namespaces.length === 0" class="text-gray-500 text-sm">
      No namespaces configured.
    </div>
    
    <div
      v-for="ns in props.namespaces"
      :key="ns.name"
      class="border rounded p-3 hover:bg-gray-50"
    >
      <div class="flex justify-between items-start">
        <div>
          <RouterLink
            :to="`/namespaces/${encodeURIComponent(ns.name)}`"
            class="font-medium text-blue-600 hover:underline"
          >
            {{ ns.name }}
          </RouterLink>
          <div class="text-xs text-gray-500">
            <span v-if="ns.git_managed">Git managed</span>
            <span v-else>unmanaged</span>
            <span v-if="ns.delivery_mode"> • {{ ns.delivery_mode }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>