<script lang="ts" setup>
import type { SealedSecretSummary } from '@/stores/secrets'
import { useRouter } from 'vue-router'

interface Props {
  secrets: SealedSecretSummary[]
  namespace: string
}

const props = defineProps<Props>()
const router = useRouter()

function goToSecret(name: string) {
  router.push(`/secrets/${encodeURIComponent(props.namespace)}/${encodeURIComponent(name)}`)
}
</script>

<template>
  <div class="space-y-2">
    <div v-if="props.secrets.length === 0" class="text-gray-500 text-sm">
      No secrets in this namespace.
    </div>
    
    <div
      v-for="secret in props.secrets"
      :key="secret.name"
      class="border rounded p-3 hover:bg-gray-50"
    >
      <div class="flex justify-between items-start">
        <div>
          <div class="font-medium">{{ secret.name }}</div>
          <div class="text-xs text-gray-500">
            {{ secret.key_count }} keys • {{ secret.scope || 'strict' }}
          </div>
        </div>
        <button
          @click="goToSecret(secret.name)"
          class="text-sm text-blue-600 hover:underline"
        >
          Edit
        </button>
      </div>
      
      <div v-if="secret.git.drift === 'diverged'" class="mt-2 text-xs text-red-600">
        Live and Git versions differ
      </div>
      
      <div v-if="secret.git.base_commit" class="text-xs text-gray-400">
        base: {{ secret.git.base_commit.slice(0, 7) }}
      </div>
    </div>
  </div>
</template>