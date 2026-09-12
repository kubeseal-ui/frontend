import { defineStore } from 'pinia'
import { api } from '@/api'
import type { SealedSecretDetail, SealedSecretSummary, Namespace } from '@/types'
export type { SealedSecretDetail, SealedSecretSummary } from '@/types'

export interface EncryptedDiff { before: string; after: string; key: string; base_commit: string; checksum: string }
export interface DeliveryResult { mode: 'direct' | 'proposal'; commit_sha: string; branch?: string; file_path?: string; proposal_url?: string; argocd_sync_verified: false }
/** Ciphertext-only draft for a brand new SealedSecret. The plaintext Secret never enters the store. */
export interface NewSecretDraft { namespace: string; name: string; scope: string; yaml: string; base_commit: string }
export interface ListResponse<T> { namespaces?: T[]; secrets?: T[] }
function idempotencyKey() { return crypto.randomUUID() }

export const useSecretsStore = defineStore('secrets', {
  state: () => ({
    namespaces: [] as Namespace[], secrets: [] as SealedSecretSummary[], currentDetail: null as SealedSecretDetail | null,
    currentDiff: null as EncryptedDiff | null, pendingMutation: null as { namespace: string; name: string; value: string; operation: 'replace' | 'add' | 'delete' } | null,
    newSecretDraft: null as NewSecretDraft | null,
    deliveryResult: null as DeliveryResult | null, loading: false, error: null as Error | null,
  }),
  actions: {
    async fetchNamespaces() { this.loading = true; this.error = null; try { const response = await api.get<ListResponse<Namespace>>('/api/v1/namespaces'); this.namespaces = response.data.namespaces || []; return this.namespaces } catch (error) { this.error = error instanceof Error ? error : new Error('Failed to load namespaces'); throw error } finally { this.loading = false } },
    async fetchSecrets(namespace: string) { this.loading = true; this.error = null; try { const response = await api.get<ListResponse<SealedSecretSummary>>(`/api/v1/secrets?namespace=${encodeURIComponent(namespace)}`); this.secrets = response.data.secrets || []; return this.secrets } catch (error) { this.error = error instanceof Error ? error : new Error('Failed to load secrets'); throw error } finally { this.loading = false } },
    async fetchDetail(namespace: string, name: string) { this.loading = true; this.error = null; try { const response = await api.get<SealedSecretDetail>(`/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`); this.currentDetail = response.data; return response.data } catch (error) { this.error = error instanceof Error ? error : new Error('Failed to load secret'); throw error } finally { this.loading = false } },
    async reveal(namespace: string, name: string, key: string, baseCommit: string) { const response = await api.post<{ key: string; value: string }>(`/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/reveal`, { key, base_commit: baseCommit }); return response.data },
    async computeDiff(namespace: string, name: string, key: string, operation: 'replace' | 'add' | 'delete', value: string, baseCommit: string) { const response = await api.post<EncryptedDiff>(`/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/diff`, { key, operation, value, base_commit: baseCommit }, { 'Idempotency-Key': idempotencyKey() }); this.currentDiff = response.data; this.pendingMutation = { namespace, name, value, operation }; return response.data },
    async applyReviewedMutation() { if (!this.currentDiff || !this.pendingMutation) throw new Error('No reviewed mutation'); const { namespace, name, value, operation } = this.pendingMutation; const response = await api.patch<{ yaml: string; checksum: string; diff_before: string; diff_after: string }>(`/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/values/${encodeURIComponent(this.currentDiff.key)}`, { value, base_commit: this.currentDiff.base_commit, operation }, { 'Idempotency-Key': idempotencyKey() }); this.clearSensitiveState(); return response.data },
    async reseal(namespace: string, name: string, key: string, value: string, baseCommit: string, operation: 'replace' | 'add' | 'delete') { const response = await api.patch<{ yaml: string; checksum: string; diff_before: string; diff_after: string }>(`/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/values/${encodeURIComponent(key)}`, { value, base_commit: baseCommit, operation }, { 'Idempotency-Key': idempotencyKey() }); return response.data },
    /** Encrypts a complete new Secret and hands the ciphertext to the shared review/delivery state. */
    async createNewSecretDraft(namespace: string, name: string, yaml: string, scope: string, baseCommit: string) { const response = await api.post<{ yaml: string }>('/api/v1/secrets/encrypt', { namespace, name, yaml, scope }); this.newSecretDraft = { namespace, name, scope, yaml: response.data.yaml, base_commit: baseCommit }; return this.newSecretDraft },
    discardNewSecretDraft() { this.newSecretDraft = null },
    async deliver(namespace: string, name: string, yaml: string, baseCommit: string) { const response = await api.post<DeliveryResult>('/api/v1/gitops/deliver', { namespace, name, yaml, base_commit: baseCommit }, { 'Idempotency-Key': idempotencyKey() }); this.deliveryResult = response.data; return response.data },
    clearSensitiveState() { this.currentDetail = null; this.currentDiff = null; this.pendingMutation = null; this.newSecretDraft = null; this.deliveryResult = null },
  },
})
