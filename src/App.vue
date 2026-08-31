<script setup lang="ts">
// Root component: minimal landing page that confirms the bundle loaded and
// exposes a link to the OIDC login flow. Real nav, secret lists, and editor
// views will replace this in subsequent phases.
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { NConfigProvider, NMessageProvider, NSpace, NButton, NText } from 'naive-ui'

const route = useRoute()
const currentPath = computed(() => route.fullPath)
</script>

<template>
  <NConfigProvider>
    <NMessageProvider>
      <div class="min-h-screen bg-gray-50 text-gray-900 p-8">
        <NSpace vertical size="large">
          <div>
            <h1 class="text-3xl font-bold">kubeseal-ui</h1>
            <NText depth="3">Team-oriented SealedSecrets administration</NText>
          </div>

          <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <NSpace vertical size="small">
              <div>
                <strong>Status:</strong> frontend scaffolded
              </div>
              <div>
                <strong>Route:</strong> <code>{{ currentPath }}</code>
              </div>
              <NButton tag="a" href="/api/v1/auth/login" type="primary">
                Sign in (OIDC)
              </NButton>
            </NSpace>
          </div>
        </NSpace>
      </div>
    </NMessageProvider>
  </NConfigProvider>
</template>
