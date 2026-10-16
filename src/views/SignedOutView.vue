<script setup lang="ts">
import AppButton from '@/components/ui/AppButton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'

// A full navigation, not a router push: /api/v1/auth/login is the server's OIDC entry point, so
// signing back in has to leave the SPA entirely.
function signIn() {
  window.location.assign('/api/v1/auth/login')
}
</script>

<template>
  <div class="flex min-h-[60dvh] items-center justify-center">
    <div class="flex w-full max-w-[380px] flex-col items-center gap-2 rounded-card-inner border border-border bg-surface px-6 py-10 text-center">
      <span class="mb-1 flex size-[38px] items-center justify-center rounded-control bg-surface-raised text-muted">
        <AppIcon name="lock" :size="18" />
      </span>
      <h1 class="m-0 text-lg font-semibold tracking-[-0.02em] text-ink">Signed out</h1>
      <p class="m-0 max-w-prose text-sm text-muted">Your session has ended. Sign in again to continue.</p>
      <AppButton variant="primary" size="medium" class="mt-3" @click="signIn">Sign in again</AppButton>
    </div>
  </div>
</template>
