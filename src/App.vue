<script setup lang="ts">
import { NConfigProvider, NMessageProvider, darkTheme, lightTheme } from 'naive-ui'
import AppShell from '@/components/AppShell.vue'
import { useColorScheme } from '@/composables/useColorScheme'
import { useGlassSpecular } from '@/composables/useGlassSpecular'

// Resolving the scheme here, in the app root's setup, publishes data-theme
// before the first paint. Until the bundle runs, the stylesheet's
// prefers-color-scheme block governs, so there is no unstyled flash.
const { isDark, themeOverrides } = useColorScheme()

// The specular highlight is a property of the material, so it is driven from
// the root as one delegated listener rather than one per glass component.
useGlassSpecular()
</script>

<template>
  <NConfigProvider :theme="isDark ? darkTheme : lightTheme" :theme-overrides="themeOverrides">
    <NMessageProvider>
      <AppShell>
        <RouterView />
      </AppShell>
    </NMessageProvider>
  </NConfigProvider>
</template>
