<script lang="ts" setup>
import { ref, reactive } from 'vue'
import { useSecretsStore } from '@/stores/secrets'
import type { SealedSecretDetail } from '@/stores/secrets'

interface Props {
  detail: SealedSecretDetail
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'patch', namespace: string, name: string, key: string, value: string, baseCommit: string): void
}>()

const secretsStore = useSecretsStore()
const revealed = reactive<Record<string, string>>({})
const replacements = reactive<Record<string, string>>({})

async function reveal(key: string) {
  if (!props.detail.git.base_commit) return

  const result = await secretsStore.reveal(props.detail.namespace, props.detail.name, key, props.detail.git.base_commit)
  revealed[key] = result.value
}

async function patchKey(key: string) {
  if (!props.detail.git.base_commit) return

  const result = await secretsStore.reseal(
    props.detail.namespace,
    props.detail.name,
    key,
    replacements[key],
    props.detail.git.base_commit,
    'replace'
  )

  delete revealed[key]
  delete replacements[key]

  emit('patch', props.detail.namespace, props.detail.name, key, replacements[key], result.yaml)
}

function clear(key: string) {
  delete revealed[key]
  delete replacements[key]
}
</script>

<template>
  <div class="space-y-2">
    <div v-for="key in props.detail.keys" :key="key" class="flex items-center gap-2">
      <span class="font-mono text-sm">{{ key }}</span>
      <button
        v-if="!revealed[key] && !replacements[key]"
        class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200"
        @click="reveal(key)"
      >
        Reveal
      </button>
      <input
        v-if="revealed[key]"
        v-model="replacements[key]"
        type="text"
        class="flex-1 px-2 py-1 text-sm border rounded"
        placeholder="replacement value"
      />
      <button
        v-if="revealed[key] || replacements[key]"
        class="px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200"
        @click="patchKey(key)"
      >
        Patch
      </button>
      <button
        v-if="revealed[key] || replacements[key]"
        class="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200"
        @click="clear(key)"
      >
        Clear
      </button>
    </div>
  </div>
</template>