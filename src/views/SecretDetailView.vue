<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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

const route = useRoute(); const router = useRouter(); const auth = useAuthStore(); const store = useSecretsStore()
const loading = ref(true); const error = ref('')
const namespace = () => String(route.params.namespace); const name = () => String(route.params.name)
const canPatch = computed(() => auth.hasCapability(namespace(), 'secret:seal') && auth.hasCapability(namespace(), 'secret:decrypt'))
// Review and delivery on this page now only ever follow a one-key patch.
// Creating a new Secret is an action on the namespace, not on someone else's
// Secret, and lives at /namespaces/:namespace/new.
const showReview = computed(() => canPatch.value)

async function load() {
  loading.value = true;
  error.value = '';
  store.clearSensitiveState();
  try {
    await Promise.all([
      store.fetchDetail(namespace(), name()),
      store.fetchGitPaths()
    ])
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Unable to load secret'
  } finally {
    loading.value = false
  }
}

function driftStatus() { const git = store.currentDetail?.git; return git?.drift || (git?.in_sync_with_live ? 'in-sync' : 'unknown') }

const syncing = ref(false)
const syncError = ref('')
const syncSuccess = ref('')

const canSync = computed(() => {
  const mode = store.currentDetail?.git?.delivery_mode
  if (mode === 'proposal') {
    return auth.hasCapability(namespace(), 'gitops:propose')
  }
  return auth.hasCapability(namespace(), 'gitops:push')
})

async function onSync() {
  if (!store.currentDetail) return
  syncing.value = true
  syncError.value = ''
  syncSuccess.value = ''
  try {
    const res = await store.syncToGit(namespace(), name(), store.currentDetail.git.base_commit || '')
    syncSuccess.value = `Successfully synced live secret to Git (${res.mode} mode, commit ${res.commit_sha.slice(0, 7)})`
  } catch (e) {
    syncError.value = e instanceof Error ? e.message : 'Failed to sync secret to Git'
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
            <p class="m-0 text-muted">{{ store.currentDetail.namespace }} · {{ store.currentDetail.key_count }} encrypted keys</p>
          </template>
        </AppPageHeader>

        <AppAlert v-if="syncSuccess" type="success" closable class="mb-4" @close="syncSuccess = ''">{{ syncSuccess }}</AppAlert>
        <AppAlert v-if="syncError" type="error" closable class="mb-4" @close="syncError = ''">{{ syncError }}</AppAlert>

        <!--
          Drift gates editing, so it is stated above both columns rather than
          inside one of them: a reader who only ever looks at the rail still has
          to be told why the key rows refuse to open.
        -->
        <AppAlert v-if="driftStatus() !== 'in-sync'" type="warning" title="Git source is not confirmed in sync" class="mb-6">
          <p class="m-0">Status: {{ driftStatus() }}. Reveal, editing, and delivery are disabled.</p>
          <p v-if="driftStatus() === 'git_only'" class="mt-2 mb-0">
            Manifest exists in Git but not in cluster. Pending ArgoCD reconciliation.
          </p>
          <AppButton v-else-if="canSync" variant="primary" size="small" class="mt-2" :loading="syncing" @click="onSync">
            Sync Live Secret to Git
          </AppButton>
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
                  <dd class="m-0 mt-1">{{ driftStatus() }}</dd>
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
