<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { NButton, NCard, NEmpty, NSpin } from 'naive-ui'
import { useSecretsStore } from '@/stores/secrets'

const secrets = useSecretsStore()

onMounted(async () => {
  if (secrets.namespaces.length === 0) await secrets.fetchNamespaces()
})
</script>

<template>
  <section aria-labelledby="page-title">
    <div class="page-heading">
      <div>
        <p class="eyebrow">Encrypted configuration</p>
        <h1 id="page-title">Namespaces</h1>
      </div>
      <NButton secondary @click="secrets.fetchNamespaces">Refresh</NButton>
    </div>

    <NSpin :show="secrets.loading">
      <div v-if="secrets.error" class="state-panel error-panel" role="alert">
        <strong>Unable to load namespaces.</strong>
        <p>{{ secrets.error.message }}</p>
        <NButton @click="secrets.fetchNamespaces">Try again</NButton>
      </div>
      <NEmpty v-else-if="secrets.namespaces.length === 0" description="No authorized namespaces" />
      <div v-else class="namespace-grid">
        <NCard v-for="namespace in secrets.namespaces" :key="namespace.name" class="glass-blur" hoverable>
          <RouterLink :to="`/namespaces/${encodeURIComponent(namespace.name)}`" class="card-link">
            <h2>{{ namespace.name }}</h2>
            <span v-if="namespace.git_managed">Git managed</span>
            <span v-else>unmanaged</span>
            <span v-if="namespace.delivery_mode"> • {{ namespace.delivery_mode }}</span>
          </RouterLink>
        </NCard>
      </div>
    </NSpin>
  </section>
</template>
