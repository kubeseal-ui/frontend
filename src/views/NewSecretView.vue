<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppTag from '@/components/ui/AppTag.vue'
import SecretNameEditor from '@/components/SecretNameEditor.vue'
import DeliveryPanel from '@/components/DeliveryPanel.vue'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'

const props = defineProps<{ namespace: string }>()
const auth = useAuthStore()
const secrets = useSecretsStore()

const canSeal = computed(() => auth.hasCapability(props.namespace, 'secret:seal'))
// Fixed per namespace. An unmapped namespace can still be encrypted, so the rail says so
// before the user writes a manifest rather than after.
const deliveryMode = computed(() => secrets.namespaceDeliveryMode(props.namespace))
const hasDeliveryPolicy = computed(() => Boolean(deliveryMode.value))

// Shown here as context only; SecretNameEditor owns the path picker.
const namespacePaths = computed(() => secrets.namespaceGitPaths(props.namespace))
const allowedPaths = computed(() => namespacePaths.value?.allowed_paths || [])
const defaultPath = computed(() => namespacePaths.value?.default_path || '')
// A wildcard names no paths: the server renders the target from a template the listing
// does not carry, so the rail can say where the path comes from but not what it is.
const isWildcard = computed(() => namespacePaths.value?.namespace === '*')

onMounted(() => {
  // SecretNameEditor reads the same listing; either may mount first.
  if (!secrets.gitPaths) secrets.fetchGitPaths()
})

// A half-finished encrypted draft belongs to this page and would follow the user to the
// next one, where it has no meaning.
onUnmounted(() => secrets.discardNewSecretDraft())
</script>

<template>
  <section aria-labelledby="page-title">
    <RouterLink
      :to="`/namespaces/${encodeURIComponent(props.namespace)}`"
      class="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent no-underline hover:underline"
    >
      <AppIcon name="chevron-left" :size="14" />
      {{ props.namespace }}
    </RouterLink>

    <AppPageHeader eyebrow="New" title="Create a SealedSecret" title-id="page-title" />

    <AppAlert v-if="!canSeal" type="error" title="Access denied">
      <p class="m-0">
        Creating a SealedSecret in {{ props.namespace }} requires the
        <code class="font-mono">secret:seal</code> capability, which your account does not have here.
      </p>
      <RouterLink
        :to="`/namespaces/${encodeURIComponent(props.namespace)}`"
        class="mt-2 inline-block font-semibold text-accent no-underline"
      >Back to {{ props.namespace }}</RouterLink>
    </AppAlert>

    <div v-else class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div class="flex min-w-0 flex-col gap-6">
        <SecretNameEditor :namespace="props.namespace" />
        <DeliveryPanel />
      </div>

      <div class="lg:sticky lg:top-24">
        <AppCard title="Namespace context" icon="namespace">
          <dl class="m-0 flex flex-col gap-4 text-sm">
            <div>
              <dt class="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Namespace</dt>
              <dd class="m-0 mt-1 break-words">{{ props.namespace }}</dd>
            </div>
            <div>
              <dt class="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Delivery mode</dt>
              <dd class="m-0 mt-1">
                <AppTag v-if="hasDeliveryPolicy" tone="accent">{{ deliveryMode }}</AppTag>
                <span v-else class="text-muted">Not configured</span>
              </dd>
            </div>
            <div>
              <dt class="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Target directories</dt>
              <dd class="m-0 mt-1 flex flex-col gap-1">
                <span
                  v-for="path in allowedPaths"
                  :key="path"
                  class="flex items-center gap-1.5 break-all font-mono text-xs"
                >
                  {{ path }}
                  <AppTag v-if="path === defaultPath">default</AppTag>
                </span>
                <span v-if="allowedPaths.length === 0 && isWildcard" class="text-muted">
                  Rendered per Secret from this namespace's mapping
                </span>
                <span v-else-if="allowedPaths.length === 0" class="text-muted">No paths mapped</span>
              </dd>
            </div>
          </dl>

          <AppAlert v-if="!hasDeliveryPolicy" type="info" title="No Git delivery for this namespace" class="mt-4">
            This namespace has no Git mapping, so the encrypted manifest can be produced and reviewed here but not delivered. Ask a platform administrator to map the namespace.
          </AppAlert>
        </AppCard>
      </div>
    </div>
  </section>
</template>
