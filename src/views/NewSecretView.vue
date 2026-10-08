<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import { NAlert } from 'naive-ui'
import SecretNameEditor from '@/components/SecretNameEditor.vue'
import DeliveryPanel from '@/components/DeliveryPanel.vue'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'

const props = defineProps<{ namespace: string }>()
const auth = useAuthStore()
const secrets = useSecretsStore()

const canSeal = computed(() => auth.hasCapability(props.namespace, 'secret:seal'))
/**
 * Delivery mode is fixed per namespace by the authorization ConfigMap. An
 * unmapped namespace can still be encrypted, but nothing can be delivered from
 * here, so say that before the user writes a manifest rather than after.
 */
const hasDeliveryPolicy = computed(() => Boolean(secrets.namespaceDeliveryMode(props.namespace)))

onMounted(() => {
  // SecretNameEditor also loads these for the allowed-path picker; the panel
  // reads the mode from the same listing.
  secrets.fetchGitPaths()
})

// A half-finished encrypted draft belongs to this page. Leaving it in the
// store would follow the user to the next page, where it has no meaning.
onUnmounted(() => secrets.discardNewSecretDraft())
</script>

<template>
  <section aria-labelledby="page-title">
    <RouterLink
      :to="`/namespaces/${encodeURIComponent(props.namespace)}`"
      class="mb-6 inline-block font-semibold text-accent no-underline"
    >← {{ props.namespace }}</RouterLink>

    <div class="mb-6">
      <p class="mb-1.5 text-xs font-bold uppercase tracking-[0.1em] text-accent">New</p>
      <h1 id="page-title" class="mb-0 text-[clamp(1.8rem,4vw,2.5rem)] tracking-tight">Create a SealedSecret</h1>
    </div>

    <div v-if="!canSeal" class="grid gap-2 rounded-card-inner border border-danger bg-surface/60 p-4" role="alert">
      <strong>Access denied.</strong>
      <p class="mb-1 text-muted">
        Creating a SealedSecret in {{ props.namespace }} requires the
        <code class="font-mono">secret:seal</code> capability, which your account does not have here.
      </p>
      <RouterLink
        :to="`/namespaces/${encodeURIComponent(props.namespace)}`"
        class="font-semibold text-accent no-underline"
      >Back to {{ props.namespace }}</RouterLink>
    </div>

    <template v-else>
      <NAlert v-if="!hasDeliveryPolicy" type="info" title="No Git delivery for this namespace" class="mb-4">
        This namespace has no Git mapping, so the encrypted manifest can be produced and reviewed here but not delivered. Ask a platform administrator to map the namespace.
      </NAlert>
      <SecretNameEditor :namespace="props.namespace" class="mb-4" />
      <DeliveryPanel />
    </template>
  </section>
</template>
