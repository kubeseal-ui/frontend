<script setup lang="ts">
import { NAlert } from 'naive-ui'
import type { SealedSecretDetail } from '@/types'

defineProps<{ detail: SealedSecretDetail }>()
</script>

<template>
  <NAlert type="info" title="Value editing is unavailable in this phase">
    Phase 1 and 2 expose encrypted metadata only. Existing plaintext values are not loaded into the browser.
  </NAlert>
</template>
