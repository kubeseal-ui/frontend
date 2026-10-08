<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { NButton } from 'naive-ui'
import { useAuthStore } from '@/stores/auth'
import { useUiStore, type ThemePreference } from '@/stores/ui'

const auth = useAuthStore()
const ui = useUiStore()

const displayName = computed(() => auth.user?.name || auth.user?.username || '')

const themes: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

async function logout() {
  await auth.logout()
}
</script>

<template>
  <div class="app-shell">
    <a class="skip-link" href="#main-content">Skip to main content</a>

    <header class="app-header">
      <RouterLink to="/" class="brand">kubeseal-ui</RouterLink>

      <div class="header-cluster">
        <span v-if="displayName" class="user-label">{{ displayName }}</span>

        <!-- A segmented control of pressed buttons rather than a radio group:
             the state is exposed per control with aria-pressed and the group
             carries the accessible name, which survives being embedded in a
             header without relying on attribute pass-through. -->
        <div class="theme-control" role="group" aria-label="Colour theme">
          <button
            v-for="theme in themes"
            :key="theme.value"
            type="button"
            class="theme-option"
            :class="{ 'theme-option--active': ui.themePreference === theme.value }"
            :aria-pressed="ui.themePreference === theme.value"
            @click="ui.setThemePreference(theme.value)"
          >
            {{ theme.label }}
          </button>
        </div>

        <NButton v-if="auth.isAuthenticated" secondary @click="logout">Sign out</NButton>
      </div>
    </header>

    <main id="main-content" class="content-shell">
      <slot />
    </main>
  </div>
</template>
