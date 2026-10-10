<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SealedSecretDetail } from '@/types'

// The document's second mode. It renders the ciphertext the cluster holds rather than an editor
// over it: every write in this app travels as a batch of `mutations`, which a free-text YAML box
// has no way to express, so an edit made here could not be reviewed or applied.
const props = defineProps<{ detail: SealedSecretDetail }>()

const yaml = computed(() => props.detail.sealed_secret_yaml || props.detail.yaml || '')
const copied = ref(false)

// The clipboard is not always granted, and a copy button that silently does nothing is worse
// than no button, so the failure is shown as plainly as the success.
async function copy() {
  try {
    await navigator.clipboard.writeText(yaml.value)
    copied.value = true
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <p class="m-0 text-sm text-muted">
      Read-only. Edits are staged as key changes, then reviewed as ciphertext before anything is written.
    </p>
    <pre class="m-0 max-h-[32rem] overflow-auto rounded-card-inner border border-border bg-surface-raised/70 p-3 text-xs leading-relaxed"><code class="font-mono whitespace-pre">{{ yaml || 'The server did not return a manifest for this Secret.' }}</code></pre>
    <div class="flex items-center gap-2">
      <button
        v-if="yaml"
        type="button"
        class="cursor-pointer rounded-chip border border-border-strong bg-surface/70 px-2.5 py-1 text-xs font-medium text-ink"
        @click="copy"
      >{{ copied ? 'Copied' : 'Copy YAML' }}</button>
      <span role="status" class="text-xs text-muted">{{ copied ? 'The manifest is on the clipboard.' : '' }}</span>
    </div>
  </div>
</template>
