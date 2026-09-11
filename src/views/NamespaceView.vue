<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { NButton, NCard, NEmpty, NSpin } from 'naive-ui'
import { useSecretsStore } from '@/stores/secrets'

const props = defineProps<{ namespace: string }>()
const secrets = useSecretsStore()
const loaded = ref(false)

async function load() {
  loaded.value = false
  try {
    await secrets.fetchSecrets(props.namespace)
  } finally {
    loaded.value = true
  }
}

onMounted(load)
</script>

<template>
  <main class="content-shell" aria-labelledby="namespace-title">
    <RouterLink to="/" class="back-link">← Namespaces</RouterLink>
    <div class="page-heading">
      <div>
        <p class="eyebrow">Namespace</p>
        <h1 id="namespace-title">{{ props.namespace }}</h1>
      </div>
      <NButton secondary @click="load">Refresh</NButton>
    </div>

    <NSpin :show="!loaded || secrets.loading">
      <div v-if="secrets.error" class="state-panel error-panel" role="alert">
        <strong>Unable to load secrets.</strong>
        <p>{{ secrets.error.message }}</p>
        <NButton @click="load">Try again</NButton>
      </div>
      <NEmpty v-else-if="secrets.secrets.length === 0" description="No SealedSecrets in this namespace" />
      <div v-else class="secret-list" aria-label="SealedSecrets">
        <NCard v-for="secret in secrets.secrets" :key="secret.name" hoverable>
          <RouterLink :to="`/secrets/${encodeURIComponent(props.namespace)}/${encodeURIComponent(secret.name)}`" class="card-link">
            <div class="secret-row">
              <div>
                <h2>{{ secret.name }}</h2>
                <p>{{ secret.key_count }} keys · {{ secret.scope || 'strict' }}</p>
              </div>
              <span class="status-badge" :data-status="secret.git.drift">
                {{ secret.git.drift }}
              </span>
            </div>
          </RouterLink>
        </NCard>
      </div>
    </NSpin>
  </main>
</template>
