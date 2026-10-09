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
/**
 * The last sync's outcome, kept whole.
 *
 * The sync endpoint answers with the same DeliveryResult the delivery endpoint
 * does — mode, commit, branch, file, and a proposal URL in proposal mode — and
 * this page used to print "(direct mode, commit abc1234)" and drop the rest, so
 * a proposal-mode sync named neither the branch nor the file and never linked
 * the proposal it opened. Both sentences come from the shared builders the
 * delivery panel uses, which is what keeps the two controls that write to Git
 * from reporting the same push differently.
 */
const syncOutcome = ref<DeliveryResult | null>(null)
const namespace = () => String(route.params.namespace); const name = () => String(route.params.name)
const canPatch = computed(() => auth.hasCapability(namespace(), 'secret:seal') && auth.hasCapability(namespace(), 'secret:decrypt'))
// Review and delivery on this page now only ever follow a one-key patch.
// Creating a new Secret is an action on the namespace, not on someone else's
// Secret, and lives at /namespaces/:namespace/new.
const showReview = computed(() => canPatch.value)

async function load() {
  loading.value = true;
  error.value = '';
  // The sync report belongs to the Secret it was made for. A route change reuses
  // this view instance — the route record is the same one and the router view is
  // unkeyed — so without this the previous Secret's banner would be rendered
  // above the next one's metadata, claiming a sync that never happened to it.
  syncOutcome.value = null;
  syncError.value = '';
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

/**
 * The drift state as a word.
 *
 * The API sends the underscored enum, and this page used to print it as it
 * arrived — "Status: live_only" in a warning addressed to an operator. It reads
 * from the same vocabulary the namespace cards and their filter chips use, so a
 * state cannot be called one thing there and another here.
 */
const driftLabel = computed(() => driftPresentation(driftStatus()).label)

const syncing = ref(false)

/**
 * The commit the sync would be built on.
 *
 * The sync endpoint compares it against the branch head and refuses an empty
 * one, so an absent value is not something to send empty: it is the reason not
 * to offer the control, which would otherwise be a button whose only outcome is
 * a refusal. It comes from the same Git read that produced the drift, and the
 * server reports the branch head for a manifest Git does not hold yet — which is
 * exactly the live-only Secret this control exists for.
 */
const syncBaseCommit = computed(() => store.currentDetail?.git.base_commit || '')

/**
 * Whether this caller may write this namespace's Git source.
 *
 * The capability follows from the namespace's fixed delivery mode and is read
 * through the same rule the delivery panel gates on. An unknown mode means the
 * namespace has no Git mapping at all — the server reports the mode alongside
 * every mapping it resolves — and there is then nothing to sync to.
 */
const canSync = computed(() => {
  const required = requiredDeliveryCapability(store.currentDetail?.git.delivery_mode || '')
  return required ? auth.hasCapability(namespace(), required) : false
})

/**
 * Why the sync control is not offered, when it is not.
 *
 * Three situations reach this page and they need three different answers: no
 * Git policy at all, a policy whose source could not be read far enough to
 * produce a branch head, and a caller without the capability the namespace's
 * mode requires. Saying which one it is turns a missing button into an
 * instruction.
 */
const syncUnavailable = computed(() => {
  const mode = store.currentDetail?.git.delivery_mode
  if (!mode) return 'This namespace has no Git delivery policy, so there is nowhere in Git for this Secret to be synced to.'
  if (!syncBaseCommit.value) return 'The Git source could not be read, so there is no branch head to sync against. Reload the page and try again.'
  return `Syncing writes to Git, which needs the ${requiredDeliveryCapability(mode)} capability in this namespace.`
})

const syncTitle = computed(() => syncOutcome.value ? deliveryHeading(syncOutcome.value, 'Synced to Git') : '')
/**
 * What the sync wrote, in the same sentence the delivery panel would print.
 *
 * The branch and file fall back to the ones this Secret's Git state already
 * named, which are the values the server resolved when it read the source.
 */
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

    <!-- The detail is cleared before every load, so nothing below can be
         rendered until the fetch has settled; an empty result and a failed one
         are then told apart rather than both reading as "not found". -->
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

        <!--
          The sync's outcome, reported the way the delivery panel reports one:
          the endpoint answers with the commit, the branch, the file it wrote,
          and the proposal it opened when the namespace's policy is proposal
          mode. Naming all of them is what makes the report checkable against
          the repository, and the proposal URL is a link to the thing itself
          rather than inert text.
        -->
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

        <!--
          Drift gates editing, so it is stated above both columns rather than
          inside one of them: a reader who only ever looks at the rail still has
          to be told why the key rows refuse to open.
        -->
        <AppAlert v-if="driftStatus() !== 'in-sync'" type="warning" title="Git source is not confirmed in sync" class="mb-6">
          <p class="m-0">Status: {{ driftLabel }}. Reveal, editing, and delivery are disabled.</p>
          <!--
            Git-only is the one drift nothing here can act on: this page writes
            to Git and never to the cluster, so a manifest with no live Secret is
            not something any control on it could create. Whether a cluster-side
            GitOps controller then applies it is not something the browser can
            observe, so it is named as the condition it would take rather than
            reported as an event already in flight.
          -->
          <p v-if="driftStatus() === 'git_only'" class="mt-2 mb-0">
            The manifest is in Git and there is no Secret for it in the cluster. Nothing on this page writes to the
            cluster — a GitOps controller managing this namespace is what would apply it.
          </p>
          <!--
            The sync control needs a branch head to build on. Without one the
            button could only ever be refused for an empty base commit, so the
            reason takes its place.
          -->
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

          <!-- The rail is a wrapper rather than the card itself: the card is
               `h-full`, and a sticky box cannot be as tall as its own scroll
               range. In an auto-height wrapper that percentage resolves to
               auto, which leaves the card its own height to travel within. -->
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
