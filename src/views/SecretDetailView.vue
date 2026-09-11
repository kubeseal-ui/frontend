<script lang="ts" setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSecretsStore } from '@/stores/secrets'
import { useAuthStore } from '@/stores/auth'
import type { SealedSecretDetail } from '@/stores/secrets'

const route = useRoute()
const router = useRouter()
const secretsStore = useSecretsStore()
const authStore = useAuthStore()

const loading = ref(true)

onMounted(async () => {
  const namespace = route.params.namespace as string
  const name = route.params.name as string

  if (!namespace || !name) return

  try {
    await secretsStore.fetchDetail(namespace, name)
  } catch (e) {
    console.error('Failed to load secret:', e)
  } finally {
    loading.value = false
  }
})

watch(
  () => route.params,
  async () => {
    loading.value = true
    const namespace = route.params.namespace as string
    const name = route.params.name as string
    if (namespace && name) {
      await secretsStore.fetchDetail(namespace, name)
    }
    loading.value = false
  }
)

function goBack() {
  router.push('/')
}

function getDriftClass(drift: string): string {
  if (drift === 'diverged') return 'text-red-600'
  if (drift === 'in-sync') return 'text-green-600'
  return 'text-gray-600'
}
</script>

<template>
  <div class="p-4 max-w-2xl mx-auto">
    <button @click="goBack" class="mb-4 text-blue-600 hover:underline">
      &larr; Back to namespaces
    </button>

    <div v-if="loading" class="text-center">Loading...</div>

    <div v-else-if="secretsStore.currentDetail" class="space-y-4">
      <div class="bg-white p-4 rounded shadow">
        <h1 class="text-xl font-bold">{{ secretsStore.currentDetail.name }}</h1>
        <p class="text-sm text-gray-600">Namespace: {{ secretsStore.currentDetail.namespace }}</p>
      </div>

      <div v-if="secretsStore.currentDetail.git.in_sync_with_live === false" class="bg-yellow-50 p-4 rounded border border-yellow-200">
        <p class="text-yellow-800">
          Git-managed file is out of sync with live cluster state.
        </p>
        <p class="text-xs text-yellow-700 mt-1">
          Path: {{ secretsStore.currentDetail.git.file_path }}<br />
          Base commit: {{ secretsStore.currentDetail.git.base_commit || 'none' }}
        </p>
      </div>

      <SecretKeyEditor
        :detail="secretsStore.currentDetail"
        @patch="() => { /* handled in parent */ }"
      />
    </div>

    <div v-else class="text-center text-gray-500">
      Secret not found
    </div>
  </div>
</template>