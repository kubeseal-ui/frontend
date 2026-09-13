<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NDescriptions, NDescriptionsItem, NEmpty, NSpin, NTag } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import SecretKeyEditor from '@/components/SecretKeyEditor.vue'
import SecretNameEditor from '@/components/SecretNameEditor.vue'
import DeliveryPanel from '@/components/DeliveryPanel.vue'

const route = useRoute(); const router = useRouter(); const auth = useAuthStore(); const store = useSecretsStore()
const loading = ref(true); const error = ref('')
const namespace = () => String(route.params.namespace); const name = () => String(route.params.name)
const canPatch = computed(() => auth.hasCapability(namespace(), 'secret:seal') && auth.hasCapability(namespace(), 'secret:decrypt'))
const canCreate = computed(() => auth.hasCapability(namespace(), 'secret:seal'))
const showReview = computed(() => canPatch.value || canCreate.value)
async function load() { loading.value = true; error.value = ''; store.clearSensitiveState(); try { await store.fetchDetail(namespace(), name()) } catch (e) { error.value = e instanceof Error ? e.message : 'Unable to load secret' } finally { loading.value = false } }
function driftStatus() { const git = store.currentDetail?.git; return git?.drift || (git?.in_sync_with_live ? 'in-sync' : 'unknown') }
onMounted(load); watch(() => [route.params.namespace, route.params.name], load)
</script>

<template>
  <main id="main-content" class="content-shell detail-page">
    <NButton text @click="router.push({ name: 'namespace', params: { namespace: namespace() } })">← Back to namespace</NButton>
    <NSpin :show="loading">
      <NAlert v-if="error" type="error" title="Could not load SealedSecret"><p>{{ error }}</p><NButton secondary @click="load">Retry</NButton></NAlert>
      <NEmpty v-else-if="!store.currentDetail" description="SealedSecret not found" />
      <template v-else>
        <div class="page-heading"><div><NTag size="small">{{ store.currentDetail.scope || 'strict' }}</NTag><h1>{{ store.currentDetail.name }}</h1><p>{{ store.currentDetail.namespace }} · {{ store.currentDetail.key_count }} encrypted keys</p></div></div>
        <NAlert v-if="driftStatus() !== 'in-sync'" type="warning" title="Git source is not confirmed in sync">Status: {{ driftStatus() }}. Reveal, editing, and delivery are disabled.</NAlert>
        <NCard title="Metadata" segmented><NDescriptions label-placement="left" :column="1"><NDescriptionsItem label="Namespace">{{ store.currentDetail.namespace }}</NDescriptionsItem><NDescriptionsItem label="Scope">{{ store.currentDetail.scope || 'strict' }}</NDescriptionsItem><NDescriptionsItem label="Keys"><span v-for="key in store.currentDetail.keys" :key="key" class="metadata-key">{{ key }}</span></NDescriptionsItem><NDescriptionsItem label="Git status">{{ driftStatus() }}</NDescriptionsItem><NDescriptionsItem label="Mapped path">{{ store.currentDetail.git.file_path || 'Unavailable' }}</NDescriptionsItem><NDescriptionsItem label="Base commit">{{ store.currentDetail.git.base_commit || 'Unavailable' }}</NDescriptionsItem></NDescriptions></NCard>
        <SecretKeyEditor :detail="store.currentDetail" />
        <SecretNameEditor :namespace="namespace()" :base-commit="store.currentDetail.git.base_commit || ''" />
        <DeliveryPanel v-if="showReview" :detail="store.currentDetail" />
      </template>
    </NSpin>
  </main>
</template>
