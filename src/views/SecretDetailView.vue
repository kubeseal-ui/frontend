<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { describeError } from '@/api'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
import AppTag from '@/components/ui/AppTag.vue'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import SecretKeyEditor from '@/components/SecretKeyEditor.vue'
import DeliveryPanel from '@/components/DeliveryPanel.vue'
import { deliveryHeading, requiredDeliveryCapability, summarizeDelivery } from '@/utils/delivery'
import { driftPresentation } from '@/utils/drift'
import { countLabel } from '@/utils/format'
import type { DeliveryResult } from '@/types'

const route = useRoute(); const router = useRouter(); const auth = useAuthStore(); const store = useSecretsStore()
const loading = ref(true); const error = ref('')
/** The last sync's failure, or empty. It belongs to the Secret it happened on. */
const syncError = ref('')
// Printing one field of the sync result dropped the branch, file, and proposal link, so
// both sentences come from the shared builders — the two controls that write to Git must
// report the same push the same way.
const syncOutcome = ref<DeliveryResult | null>(null)
const namespace = () => String(route.params.namespace); const name = () => String(route.params.name)
const canPatch = computed(() => auth.hasCapability(namespace(), 'secret:seal') && auth.hasCapability(namespace(), 'secret:decrypt'))
const showReview = computed(() => canPatch.value)

async function load() {
  loading.value = true;
  error.value = '';
  // A route change reuses this view instance, so without clearing this the previous
  // Secret's banner would render above the next one's metadata.
  syncOutcome.value = null;  syncError.value = '';
  store.clearSensitiveState();
  try {
    await Promise.all([
      store.fetchDetail(namespace(), name()),
      store.fetchGitPaths()
    ])
  } catch (e) {
    error.value = describeError(e, 'Unable to load this SealedSecret')
  } finally {
    loading.value = false
  }
}

function driftStatus() { const git = store.currentDetail?.git; return git?.drift || (git?.in_sync_with_live ? 'in-sync' : 'unknown') }

// The API sends the underscored enum; same vocabulary as the namespace cards.
const driftLabel = computed(() => driftPresentation(driftStatus()).label)

const syncing = ref(false)

// The sync endpoint compares this against the branch head and refuses an empty one, so an
// absent value is the reason not to offer the control rather than something to send
// empty. The server reports a head even for a manifest Git does not hold yet — exactly
// the live-only Secret this control exists for.
const syncBaseCommit = computed(() => store.currentDetail?.git.base_commit || '')

// Read through the same rule the delivery panel gates on.
const canSync = computed(() => {
  const required = requiredDeliveryCapability(store.currentDetail?.git.delivery_mode || '')
  return required ? auth.hasCapability(namespace(), required) : false
})

// Three situations, three answers: no Git policy, no branch head, no capability. Saying
// which turns a missing button into an instruction.
const syncUnavailable = computed(() => {
  const mode = store.currentDetail?.git.delivery_mode
  if (!mode) return 'This namespace has no Git delivery policy, so there is nowhere in Git for this Secret to be synced to.'
  if (!syncBaseCommit.value) return 'The Git source could not be read, so there is no branch head to sync against. Reload the page and try again.'
  return `Syncing writes to Git, which needs the ${requiredDeliveryCapability(mode)} capability in this namespace.`
})

const syncTitle = computed(() => syncOutcome.value ? deliveryHeading(syncOutcome.value, 'Synced to Git') : '')
const syncSummary = computed(() => syncOutcome.value
  ? summarizeDelivery(syncOutcome.value, {
      verb: 'Synced',
      branch: store.currentDetail?.git.branch,
      file: store.currentDetail?.git.file_path,
    })
  : '')

async function onSync() {
  if (!store.currentDetail || !syncBaseCommit.value) return
  syncing.value = true
  syncError.value = ''
  syncOutcome.value = null
  try {
    syncOutcome.value = await store.syncToGit(namespace(), name(), syncBaseCommit.value)
  } catch (e) {
    syncError.value = describeError(e, 'The live Secret could not be synced to Git')
  } finally {
    syncing.value = false
  }
}

onMounted(load);
watch(() => [route.params.namespace, route.params.name], load)
</script>

<template>
  <div>
    <AppButton
      variant="ghost"
      icon="chevron-left"
      class="mb-4"
      @click="router.push({ name: 'namespace', params: { namespace: namespace() } })"
    >
      Back to namespace
    </AppButton>

    <p v-if="loading" role="status" class="mb-4 flex items-center gap-2 text-sm text-muted">
      <AppSpinner :size="15" />
      Loading SealedSecret…
    </p>

    <!-- The detail is cleared before every load, so an empty result and a failed one are
         told apart rather than both reading as "not found". -->
    <template v-else>
      <AppAlert v-if="error" type="error" title="Could not load SealedSecret">
        <p class="m-0">{{ error }}</p>
        <AppButton class="mt-2" @click="load">Retry</AppButton>
      </AppAlert>

      <AppEmpty v-else-if="!store.currentDetail" icon="lock" description="SealedSecret not found" />

      <template v-else>
        <AppPageHeader :title="store.currentDetail.name" title-id="page-title">
          <template #eyebrow>
            <AppTag tone="accent">{{ store.currentDetail.scope || 'strict' }}</AppTag>
          </template>
          <template #subtitle>
            <p class="m-0 text-muted">{{ store.currentDetail.namespace }} · {{ countLabel(store.currentDetail.key_count, 'encrypted key') }}</p>
          </template>
        </AppPageHeader>

        <!-- Reported like a delivery, because it is the same result shape. -->
        <AppAlert v-if="syncOutcome" type="success" closable :title="syncTitle" class="mb-4" @close="syncOutcome = null">
          <span class="block">{{ syncSummary }}</span>
          <a
            v-if="syncOutcome?.proposal_url"
            :href="syncOutcome?.proposal_url"
            target="_blank"
            rel="noopener noreferrer"
            class="mt-1 block break-all text-accent no-underline hover:underline"
          >{{ syncOutcome?.proposal_url }}<span class="sr-only"> (opens in a new tab)</span></a>
          <span v-if="!syncOutcome?.argocd_sync_verified" class="mt-1 block">ArgoCD synchronization is not verified by this workflow.</span>
        </AppAlert>
        <AppAlert v-if="syncError" type="error" closable class="mb-4" @close="syncError = ''">{{ syncError }}</AppAlert>

        <!-- Drift gates editing, so it is stated above both columns: a reader who only
             looks at the rail still has to be told why the rows refuse to open. -->
        <AppAlert v-if="driftStatus() !== 'in-sync'" type="warning" title="Git source is not confirmed in sync" class="mb-6">
          <p class="m-0">Status: {{ driftLabel }}. Reveal, editing, and delivery are disabled.</p>
          <!-- Git-only is the one drift nothing here can act on: this page never writes
               to the cluster. -->
          <p v-if="driftStatus() === 'git_only'" class="mt-2 mb-0">
            The manifest is in Git and there is no Secret for it in the cluster. Nothing on this page writes to the
            cluster — a GitOps controller managing this namespace is what would apply it.
          </p>
          <AppButton
            v-else-if="canSync && syncBaseCommit"
            variant="primary"
            size="small"
            class="mt-2"
            :loading="syncing"
            @click="onSync"
          >
            Sync Live Secret to Git
          </AppButton>
          <p v-else class="mt-2 mb-0">{{ syncUnavailable }}</p>
        </AppAlert>

        <div class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div class="flex min-w-0 flex-col gap-6">
            <SecretKeyEditor :detail="store.currentDetail" />
            <DeliveryPanel v-if="showReview" :detail="store.currentDetail" />
          </div>

          <!-- A wrapper, not the card: the card is `h-full`, and a sticky box cannot be
               as tall as its own scroll range. -->
          <div class="lg:sticky lg:top-24">
            <AppCard title="Metadata" icon="database">
              <dl class="m-0 flex flex-col gap-4 text-sm">
                <div>
                  <dt class="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Namespace</dt>
                  <dd class="m-0 mt-1 break-words">{{ store.currentDetail.namespace }}</dd>
                </div>
                <div>
                  <dt class="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Scope</dt>
                  <dd class="m-0 mt-1 break-words">{{ store.currentDetail.scope || 'strict' }}</dd>
                </div>
                <div>
                  <dt class="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Keys</dt>
                  <dd class="m-0 mt-1 flex flex-wrap gap-1">
                    <span
                      v-for="key in store.currentDetail.keys"
                      :key="key"
                      class="rounded-chip border border-border bg-surface-raised px-2 py-0.5 font-mono text-xs"
                    >{{ key }}</span>
                  </dd>
                </div>
                <div>
                  <dt class="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Git status</dt>
                  <dd class="m-0 mt-1">{{ driftLabel }}</dd>
                </div>
                <div>
                  <dt class="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Mapped path</dt>
                  <dd class="m-0 mt-1 break-all font-mono text-xs">{{ store.currentDetail.git.file_path || 'Unavailable' }}</dd>
                </div>
                <div>
                  <dt class="text-xs font-semibold uppercase tracking-[0.08em] text-muted">Base commit</dt>
                  <dd class="m-0 mt-1 break-all font-mono text-xs">{{ store.currentDetail.git.base_commit || 'Unavailable' }}</dd>
                </div>
              </dl>
            </AppCard>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>
