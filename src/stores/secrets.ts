import { defineStore } from 'pinia'
import { api } from '@/api'
import type { SealedSecretDetail, SealedSecretSummary, Namespace, DryRunResult, EncryptedDiff, DeliveryResult, NewSecretDraft, ListResponse, GitPathsConfig } from '@/types'
export type { SealedSecretDetail, SealedSecretSummary } from '@/types'

/** Ciphertext-only draft for a brand new SealedSecret. The plaintext Secret never enters the store. */
export type { NewSecretDraft, DryRunResult, EncryptedDiff, DeliveryResult, GitPathsConfig }

function idempotencyKey() { return crypto.randomUUID() }

export const useSecretsStore = defineStore('secrets', {
  state: () => ({
    namespaces: [] as Namespace[], secrets: [] as SealedSecretSummary[], currentDetail: null as SealedSecretDetail | null,
    currentDiff: null as EncryptedDiff | null, pendingMutation: null as { namespace: string; name: string; value: string; operation: 'replace' | 'add' | 'delete' } | null,
    newSecretDraft: null as NewSecretDraft | null,
    dryRunResult: null as DryRunResult | null,
    deliveryResult: null as DeliveryResult | null, loading: false, error: null as Error | null,
    gitPaths: null as GitPathsConfig | null,
  }),
  getters: {
    /**
     * The fixed delivery mode for a namespace, from the Git path listing.
     *
     * Delivery mode is never a user choice — it comes from the authorization
     * ConfigMap via the server. This exists so the delivery panel can resolve
     * it for a Secret that does not exist yet and therefore has no detail.
     */
    namespaceDeliveryMode: (state) => (namespace: string): 'direct' | 'proposal' | '' =>
      state.gitPaths?.namespaces?.find((entry) => entry.namespace === namespace)?.mode ?? '',
  },
  actions: {
    async fetchNamespaces() { this.loading = true; this.error = null; try { const response = await api.get<ListResponse<Namespace>>('/api/v1/namespaces'); this.namespaces = response.data.namespaces || []; return this.namespaces } catch (error) { this.error = error instanceof Error ? error : new Error('Failed to load namespaces'); throw error } finally { this.loading = false } },
    async fetchSecrets(namespace: string) { this.loading = true; this.error = null; try { const response = await api.get<ListResponse<SealedSecretSummary>>(`/api/v1/secrets?namespace=${encodeURIComponent(namespace)}`); this.secrets = response.data.secrets || []; return this.secrets } catch (error) { this.error = error instanceof Error ? error : new Error('Failed to load secrets'); throw error } finally { this.loading = false } },
    async fetchDetail(namespace: string, name: string) { this.loading = true; this.error = null; try { const response = await api.get<SealedSecretDetail>(`/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`); this.currentDetail = response.data; return response.data } catch (error) { this.error = error instanceof Error ? error : new Error('Failed to load secret'); throw error } finally { this.loading = false } },
    async reveal(namespace: string, name: string, key: string, baseCommit: string) { const response = await api.post<{ key: string; value: string }>(`/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/reveal`, { key, base_commit: baseCommit }); return response.data },
    async computeDiff(namespace: string, name: string, key: string, operation: 'replace' | 'add' | 'delete', value: string, baseCommit: string) { const response = await api.post<EncryptedDiff>(`/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/diff`, { key, operation, value, base_commit: baseCommit }, { 'Idempotency-Key': idempotencyKey() }); this.currentDiff = response.data; this.pendingMutation = { namespace, name, value, operation }; return response.data },
    async applyReviewedMutation() { if (!this.currentDiff || !this.pendingMutation) throw new Error('No reviewed mutation'); const { namespace, name, value, operation } = this.pendingMutation; const response = await api.patch<{ yaml: string; checksum: string; diff_before: string; diff_after: string }>(`/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/values/${encodeURIComponent(this.currentDiff.key)}`, { value, base_commit: this.currentDiff.base_commit, operation }, { 'Idempotency-Key': idempotencyKey() }); this.currentDetail = null; this.pendingMutation = null; return response.data },
    async reseal(namespace: string, name: string, key: string, value: string, baseCommit: string, operation: 'replace' | 'add' | 'delete') { const response = await api.patch<{ yaml: string; checksum: string; diff_before: string; diff_after: string }>(`/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/values/${encodeURIComponent(key)}`, { value, base_commit: baseCommit, operation }, { 'Idempotency-Key': idempotencyKey() }); return response.data },
    /**
     * Encrypts a complete new Secret and hands the ciphertext to the shared
     * review/delivery state.
     *
     * The base commit is the branch head the server verified the mapped path
     * against, so it is taken from the encrypt response. An explicit argument
     * still wins, which is how the detail page passes the head it already
     * holds; the create page passes nothing and uses the server's value.
     */
    async createNewSecretDraft(namespace: string, name: string, yaml: string, scope: string, baseCommit?: string, targetPath?: string) { const response = await api.post<{ yaml: string; base_commit?: string }>('/api/v1/secrets/encrypt', { namespace, name, yaml, scope, target_path: targetPath }); this.newSecretDraft = { namespace, name, scope, yaml: response.data.yaml, base_commit: baseCommit || response.data.base_commit || '' }; return this.newSecretDraft },
    discardNewSecretDraft() { this.newSecretDraft = null },
    /** Server-side Git dry-run for the reviewed ciphertext. The server resolves repository, branch, and path. */
    async dryRun(namespace: string, name: string, yaml: string, baseCommit: string, targetPath?: string) { const response = await api.post<DryRunResult>('/api/v1/gitops/dry-run', { namespace, name, yaml, base_commit: baseCommit, target_path: targetPath }, { 'Idempotency-Key': idempotencyKey() }); this.dryRunResult = response.data; return response.data },
    async deliver(namespace: string, name: string, yaml: string, baseCommit: string, targetPath?: string) { const response = await api.post<DeliveryResult>('/api/v1/gitops/deliver', { namespace, name, yaml, base_commit: baseCommit, target_path: targetPath }, { 'Idempotency-Key': idempotencyKey() }); this.deliveryResult = response.data; return response.data },
    async syncToGit(namespace: string, name: string, baseCommit: string) { const response = await api.post<DeliveryResult>('/api/v1/gitops/sync', { namespace, name, base_commit: baseCommit }, { 'Idempotency-Key': idempotencyKey() }); await this.fetchDetail(namespace, name); return response.data },
    async fetchGitPaths() { try { this.gitPaths = await api.getGitPaths(); return this.gitPaths } catch { this.gitPaths = null; return null } },
    clearSensitiveState() { this.currentDetail = null; this.currentDiff = null; this.pendingMutation = null; this.newSecretDraft = null; this.dryRunResult = null; this.deliveryResult = null },
  },
})
