<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { NButton, NCard, NEmpty, NSpin, NSpace } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'

const auth = useAuthStore()
const secrets = useSecretsStore()

onMounted(async () => {
  if (secrets.namespaces.length === 0) await secrets.fetchNamespaces()
})

async function logout() {
  await auth.logout()
}
</script>

<template>
  <main class="app-shell">
    <header class="app-header">
      <RouterLink to="/" class="brand">kubeseal-ui</RouterLink>
      <NSpace align="center">
        <span v-if="auth.user" class="user-label">{{ auth.user.name || auth.user.username }}</span>
        <NButton v-if="auth.isAuthenticated" secondary @click="logout">Sign out</NButton>
      </NSpace>
    </header>

    <section class="content-shell" aria-labelledby="page-title">
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
          <NCard v-for="namespace in secrets.namespaces" :key="namespace.name" hoverable>
            <RouterLink :to="`/namespaces/${encodeURIComponent(namespace.name)}`" class="card-link">
              <h2>{{ namespace.name }}</h2>
              <p>{{ namespace.capabilities.length }} effective capabilities</p>
              <span v-if="namespace.delivery">Delivery: {{ namespace.delivery.mode }}</span>
            </RouterLink>
          </NCard>
        </div>
      </NSpin>
    </section>
  </main>
</template>
