<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import DiffBlocks from '@/components/DiffBlocks.vue'
import PendingBar from '@/components/PendingBar.vue'
import SecretNameEditor from '@/components/SecretNameEditor.vue'
import { describeError } from '@/api'
import { renderNamespace, templateDirectory } from '@/utils/gitPath'
import { deliveryHeading, requiredDeliveryCapability, summarizeDelivery } from '@/utils/delivery'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import type { WorkflowStep } from '@/types'

const props = defineProps<{ namespace: string }>()
const auth = useAuthStore()
const secrets = useSecretsStore()

const canSeal = computed(() => auth.hasCapability(props.namespace, 'secret:seal'))
// Fixed per namespace. An unmapped namespace can still be encrypted, so the spine says so
// before the operator writes a manifest rather than after.
const deliveryMode = computed(() => secrets.namespaceDeliveryMode(props.namespace))
const hasDeliveryPolicy = computed(() => Boolean(deliveryMode.value))
const mapping = computed(() => secrets.namespaceGitPaths(props.namespace))

// The directories a Secret can land in, rendered the way the server renders them, so the spine
// lists paths rather than templates. The default is the one the template itself lands in.
const allowedPaths = computed(() => (mapping.value?.allowed_paths || []).map((directory) => renderNamespace(directory, props.namespace)))
const defaultDirectory = computed(() => templateDirectory(mapping.value?.path_template || '', props.namespace))
// A wildcard names no paths: the server renders the target from a template the listing does not
// carry, so the spine can say where the path comes from but not what it is.
const isWildcard = computed(() => mapping.value?.namespace === '*')

// What the form above is typing, so the spine can say whether the name is already taken. The
// listing rides in the search index, which is one request for the whole fleet.
const typedName = ref('')
const existingNames = computed(() => secrets.index.filter((entry) => entry.namespace === props.namespace).map((entry) => entry.name))
const takenNames = computed(() => new Set(existingNames.value))

onMounted(() => {
  // The form reads the same listing; either may mount first.
  if (!secrets.gitPaths) secrets.fetchGitPaths()
  // The spine names what is already here, which is the index the strip already loads for search.
  if (!secrets.indexLoaded && !secrets.indexLoading) secrets.fetchIndex().catch(() => {})
})

// A create's first press is Encrypt, inside the name editor. What is left of the three is the
// same two the edit path runs, so it is the same bar: check the ciphertext, then deliver it.
const step = computed<WorkflowStep>(() => (secrets.check ? 'deliver' : 'check'))
const busy = ref(false)
const pressError = ref('')
const canDeliver = computed(() => {
  const required = requiredDeliveryCapability(deliveryMode.value)
  return required ? auth.hasCapability(props.namespace, required) : false
})
const ready = computed(() => (step.value === 'deliver' ? canDeliver.value : true))

// The create path ends the way the edit path does: the delivery consumes the draft it was built
// from, leaving no next press.
const idle = computed(() => (secrets.delivery ? 'Delivered. Encrypt another manifest to run the workflow again.' : ''))

async function press() {
  if (!ready.value) return
  busy.value = true; pressError.value = ''
  try {
    if (step.value === 'check') await secrets.checkDraft()
    else await secrets.deliverChange()
  } catch (e) {
    pressError.value = describeError(e, 'The workflow could not be advanced')
  } finally { busy.value = false }
}

// A half-finished encrypted draft belongs to this page and would follow the user to the
// next one, where it has no meaning.
onUnmounted(() => secrets.discardChange())
</script>

<template>
  <section aria-labelledby="page-title">
    <div class="flex flex-wrap items-end justify-between gap-6 px-[26px] pt-6 pb-5">
      <div class="min-w-0">
        <RouterLink
          :to="`/namespaces/${encodeURIComponent(props.namespace)}`"
          class="inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted no-underline hover:text-ink"
        >
          <AppIcon name="chevron-left" :size="12" />{{ props.namespace }}
        </RouterLink>
        <h1 id="page-title" class="mt-1.5 mb-0 font-mono text-[30px] font-semibold tracking-[-0.025em] text-ink">New Secret</h1>
        <p class="mt-2 mb-0 flex flex-wrap items-baseline gap-[7px] text-[13px] text-muted">
          in <span class="font-mono text-ink">{{ props.namespace }}</span>
          <template v-if="mapping">
            <span class="text-border-strong" aria-hidden="true">·</span>
            delivering to <span class="font-mono text-ink">{{ mapping.repository }} @ {{ mapping.branch }}</span>
          </template>
        </p>
      </div>
    </div>

    <div class="px-[26px] pb-11">
      <AppAlert v-if="!canSeal" type="error" title="Access denied">
        <p class="m-0 max-w-[62ch] text-[13px] text-muted">
          Creating a SealedSecret in {{ props.namespace }} requires the
          <code class="font-mono">secret:seal</code> capability, which your account does not have here.
        </p>
        <RouterLink
          :to="`/namespaces/${encodeURIComponent(props.namespace)}`"
          class="mt-2 inline-block font-semibold text-accent no-underline"
        >Back to {{ props.namespace }}</RouterLink>
      </AppAlert>

      <div v-else class="flex flex-wrap items-start gap-x-12 gap-y-8">
        <div class="flex min-w-[22rem] flex-1 flex-col gap-6">
          <SecretNameEditor :namespace="props.namespace" @update:name="typedName = $event" />

          <section v-if="secrets.change?.encrypted || secrets.delivery" class="flex max-w-[640px] flex-col gap-3" aria-label="Encrypted draft">
            <DiffBlocks
              :after="secrets.check?.result.after || secrets.change?.encrypted || ''"
              :before="secrets.check?.result.before"
            />
            <!-- The edit path reports a delivery; a create that delivered and said nothing left a
                 spent draft on screen with no record of where it went. -->
            <AppAlert v-if="secrets.delivery" type="success" :title="deliveryHeading(secrets.delivery)">
              <span class="block text-[13px] text-muted">{{ summarizeDelivery(secrets.delivery) }}</span>
              <a
                v-if="secrets.delivery.proposal_url"
                :href="secrets.delivery.proposal_url"
                target="_blank"
                rel="noopener noreferrer"
                class="mt-1 block break-all text-[13px] text-accent no-underline hover:underline"
              >{{ secrets.delivery.proposal_url }}<span class="sr-only"> (opens in a new tab)</span></a>
              <span v-if="!secrets.delivery.argocd_sync_verified" class="mt-1 block text-[13px] text-muted">ArgoCD synchronization is not verified by this workflow.</span>
            </AppAlert>
            <AppAlert v-if="pressError" type="error" closable title="Operation failed" @close="pressError = ''">
              <p class="m-0 max-w-[62ch] text-[13px] text-muted">{{ pressError }}</p>
            </AppAlert>
            <PendingBar
              :step="step"
              :mode="deliveryMode"
              :count="0"
              :ready="ready"
              :busy="busy"
              :idle="idle"
              @press="press"
            />
          </section>
        </div>

        <!-- What the form is writing into, stated beside it: the namespace's own terms, the
             directories it allows, and the names already spoken for. -->
        <aside aria-label="Namespace context" class="flex w-[258px] shrink-0 flex-col gap-[22px]">
          <div>
            <h2 class="mb-[9px] text-xs font-[650] text-muted">This namespace</h2>
            <div class="flex items-baseline justify-between gap-3 py-[3px] text-[13px]">
              <span class="text-muted">Delivery</span>
              <span class="font-mono text-xs" :class="hasDeliveryPolicy ? 'text-ink' : 'text-warning'">{{ hasDeliveryPolicy ? deliveryMode : 'not configured' }}</span>
            </div>
            <div class="flex items-baseline justify-between gap-3 py-[3px] text-[13px]">
              <span class="text-muted">SealedSecrets</span>
              <span class="font-mono text-xs text-ink">{{ secrets.indexLoaded ? existingNames.length : '…' }}</span>
            </div>
            <div class="flex items-baseline justify-between gap-3 py-[3px] text-[13px]">
              <span class="text-muted">You can seal here</span>
              <span class="font-mono text-xs" :class="canSeal ? 'text-success' : 'text-danger'">{{ canSeal ? '✓' : '✗' }}</span>
            </div>
          </div>

          <div>
            <h2 class="mb-[9px] text-xs font-[650] text-muted">Allowed directories</h2>
            <div v-for="path in allowedPaths" :key="path" class="flex items-baseline justify-between gap-3 py-[3px]">
              <span class="min-w-0 truncate font-mono text-xs text-ink" :title="path">{{ path }}</span>
              <span v-if="path === `${defaultDirectory}/`" class="shrink-0 text-[11.5px] text-faint">default</span>
            </div>
            <p v-if="allowedPaths.length === 0 && isWildcard" class="m-0 py-[3px] text-[12.5px] text-muted">
              Rendered per Secret from this namespace's mapping.
            </p>
            <p v-else-if="allowedPaths.length === 0" class="m-0 py-[3px] text-[12.5px] text-muted">No directories mapped.</p>
          </div>

          <div v-if="secrets.indexLoaded">
            <h2 class="mb-[9px] text-xs font-[650] text-muted">Already here</h2>
            <div v-for="existing in existingNames" :key="existing" class="flex items-baseline justify-between gap-3 py-[3px]">
              <span class="min-w-0 truncate font-mono text-xs text-ink" :title="existing">{{ existing }}</span>
              <span v-if="existing === typedName.trim()" class="shrink-0 text-[11.5px] font-semibold text-danger">taken</span>
            </div>
            <p v-if="existingNames.length === 0" class="m-0 py-[3px] text-[12.5px] text-muted">No SealedSecrets yet.</p>
          </div>

          <AppAlert v-if="!hasDeliveryPolicy" type="info" title="No Git delivery for this namespace">
            <p class="m-0 max-w-[62ch] text-[13px] text-muted">
              This namespace has no Git mapping, so the encrypted manifest can be produced and reviewed here but not delivered. Ask a platform administrator to map the namespace.
            </p>
          </AppAlert>
        </aside>
      </div>
    </div>
  </section>
</template>
