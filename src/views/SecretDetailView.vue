<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NDescriptions, NDescriptionsItem, NEmpty, NSpin, NTag } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'
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
    <NButton text class="mb-6" @click="router.push({ name: 'namespace', params: { namespace: namespace() } })">← Back to namespace</NButton>
    <NSpin :show="loading">
      <NAlert v-if="error" type="error" title="Could not load SealedSecret">
        <p>{{ error }}</p>
        <NButton secondary @click="load">Retry</NButton>
      </NAlert>
      <NEmpty v-else-if="!store.currentDetail" description="SealedSecret not found" />
      <template v-else>
        <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <NTag size="small">{{ store.currentDetail.scope || 'strict' }}</NTag>
            <h1 class="mt-1 mb-0 text-[clamp(1.8rem,4vw,2.5rem)] tracking-tight">{{ store.currentDetail.name }}</h1>
            <p class="mb-0 text-muted">{{ store.currentDetail.namespace }} · {{ store.currentDetail.key_count }} encrypted keys</p>
          </div>
        </div>

        <NAlert v-if="syncSuccess" type="success" closable class="mb-4" @close="syncSuccess = ''">{{ syncSuccess }}</NAlert>
        <NAlert v-if="syncError" type="error" closable class="mb-4" @close="syncError = ''">{{ syncError }}</NAlert>
        <NAlert v-if="driftStatus() !== 'in-sync'" type="warning" title="Git source is not confirmed in sync" class="mb-4">
          <p>Status: {{ driftStatus() }}. Reveal, editing, and delivery are disabled.</p>
          <div v-if="driftStatus() === 'git_only'" class="mt-2">
            <p>Manifest exists in Git but not in cluster. Pending ArgoCD reconciliation.</p>
          </div>
          <div v-else-if="canSync" class="mt-2">
            <NButton type="primary" size="small" :loading="syncing" @click="onSync">
              Sync Live Secret to Git
            </NButton>
          </div>
        </NAlert>

        <NCard title="Metadata" segmented class="glass mb-4">
          <NDescriptions label-placement="left" :column="1">
            <NDescriptionsItem label="Namespace">{{ store.currentDetail.namespace }}</NDescriptionsItem>
            <NDescriptionsItem label="Scope">{{ store.currentDetail.scope || 'strict' }}</NDescriptionsItem>
            <NDescriptionsItem label="Keys">
              <span
                v-for="key in store.currentDetail.keys"
                :key="key"
                class="mr-1 mb-1 inline-block rounded-chip border border-border bg-surface-raised px-2 py-0.5 font-mono text-xs"
              >{{ key }}</span>
            </NDescriptionsItem>
            <NDescriptionsItem label="Git status">{{ driftStatus() }}</NDescriptionsItem>
            <NDescriptionsItem label="Mapped path">{{ store.currentDetail.git.file_path || 'Unavailable' }}</NDescriptionsItem>
            <NDescriptionsItem label="Base commit">{{ store.currentDetail.git.base_commit || 'Unavailable' }}</NDescriptionsItem>
          </NDescriptions>
        </NCard>

        <SecretKeyEditor :detail="store.currentDetail" class="mb-4" />
        <DeliveryPanel v-if="showReview" :detail="store.currentDetail" />
      </template>
    </NSpin>
  </div>
</template>
