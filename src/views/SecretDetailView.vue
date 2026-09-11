<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { NAlert, NButton, NCard, NDescriptions, NDescriptionsItem, NEmpty, NSpin, NTag } from 'naive-ui'
import { useRoute, useRouter } from 'vue-router'
import { useSecretsStore } from '@/stores/secrets'

const route = useRoute(); const router = useRouter(); const store = useSecretsStore(); const loading = ref(true); const error = ref('')
function namespace() { return String(route.params.namespace) } function name() { return String(route.params.name) }
async function load() { loading.value = true; error.value = ''; try { await store.fetchDetail(namespace(), name()) } catch (e) { error.value = e instanceof Error ? e.message : 'Unable to load secret metadata' } finally { loading.value = false } }
function driftStatus() { const git = store.currentDetail?.git; return git?.drift || (git?.in_sync_with_live ? 'in-sync' : 'unknown') }
onMounted(load); watch(() => [route.params.namespace, route.params.name], load)
</script>

<template>
  <main id="main-content" class="page-content detail-page"><NButton text @click="router.push({ name: 'namespace', params: { namespace: namespace() } })">← Back to namespace</NButton><NSpin :show="loading"><NAlert v-if="error" type="error" title="Could not load SealedSecret"><p>{{ error }}</p><NButton secondary @click="load">Retry</NButton></NAlert><NEmpty v-else-if="!store.currentDetail" description="SealedSecret not found"/><template v-else><div class="hero compact"><div><NTag size="small">{{ store.currentDetail.scope || 'strict' }}</NTag><h1>{{ store.currentDetail.name }}</h1><p>{{ store.currentDetail.namespace }} · {{ store.currentDetail.key_count }} encrypted keys</p></div></div><NAlert v-if="driftStatus() !== 'in-sync'" type="warning" title="Git source is not confirmed in sync">Status: {{ driftStatus() }}. Editing remains unavailable until a later phase verifies the source.</NAlert><NCard title="Metadata" segmented><NDescriptions label-placement="left" :column="1"><NDescriptionsItem label="Namespace">{{ store.currentDetail.namespace }}</NDescriptionsItem><NDescriptionsItem label="Scope">{{ store.currentDetail.scope || 'strict' }}</NDescriptionsItem><NDescriptionsItem label="Keys"><span v-for="key in store.currentDetail.keys" :key="key" class="metadata-key">{{ key }}</span></NDescriptionsItem><NDescriptionsItem label="Git status">{{ driftStatus() }}</NDescriptionsItem><NDescriptionsItem label="Mapped path">{{ store.currentDetail.git.file_path || 'Unavailable' }}</NDescriptionsItem><NDescriptionsItem label="Base commit">{{ store.currentDetail.git.base_commit || 'Unavailable' }}</NDescriptionsItem></NDescriptions><NAlert type="info" title="Encrypted metadata only">Phase 1 and 2 do not reveal or modify existing secret values.</NAlert></NCard></template></NSpin></main>
</template>
