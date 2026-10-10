import { defineStore } from 'pinia'
import { api } from '@/api'
import type { SealedSecretDetail, SealedSecretSummary, Namespace, DryRunResult, EncryptedDiff, DeliveryResult, NewSecretDraft, ListResponse, GitPathsConfig, NamespaceGitPaths, Mutation } from '@/types'
export type { SealedSecretDetail, SealedSecretSummary } from '@/types'

// Ciphertext only: the plaintext Secret never enters the store.
export type { NewSecretDraft, DryRunResult, EncryptedDiff, DeliveryResult, GitPathsConfig, Mutation }

function idempotencyKey() { return crypto.randomUUID() }

// The server resolves a namespace through its own mapping and then a `*` wildcard; this
// listing is raw, so a wildcard arrives unexpanded. Without the same fallback the UI
// reads a covered namespace as unmapped and refuses a delivery the server would accept.
function resolveGitPaths(config: GitPathsConfig | null, namespace: string): NamespaceGitPaths | null {
  const entries = config?.namespaces
  return entries?.find((entry) => entry.namespace === namespace)
    ?? entries?.find((entry) => entry.namespace === '*')
    ?? null
}

export const useSecretsStore = defineStore('secrets', {
  state: () => ({
    namespaces: [] as Namespace[], secrets: [] as SealedSecretSummary[], currentDetail: null as SealedSecretDetail | null,
    currentDiff: null as EncryptedDiff | null,
    // The batch the reviewed diff was computed for, so apply sends exactly what was
    // reviewed rather than whatever the editor holds by then.
    pendingMutation: null as { namespace: string; name: string; mutations: Mutation[] } | null,
    newSecretDraft: null as NewSecretDraft | null,
    dryRunResult: null as DryRunResult | null,
    deliveryResult: null as DeliveryResult | null, loading: false, error: null as Error | null,
    gitPaths: null as GitPathsConfig | null,
    // Not derivable from `gitPaths` being null, which fetchGitPaths also stores on
    // failure: a card would otherwise state "no Git mapping" for a listing that failed.
    gitPathsLoaded: false,
  }),
  getters: {
    // Prefer this over scanning `gitPaths`: a mapping stored against `*` is what the
    // server applies to a namespace with no mapping of its own.
    namespaceGitPaths: (state) => (namespace: string): NamespaceGitPaths | null =>
      resolveGitPaths(state.gitPaths, namespace),
    namespaceDeliveryMode: (state) => (namespace: string): 'direct' | 'proposal' | '' =>
      resolveGitPaths(state.gitPaths, namespace)?.mode ?? '',
  },
  actions: {
    async fetchNamespaces() { this.loading = true; this.error = null; try { const response = await api.get<ListResponse<Namespace>>('/api/v1/namespaces'); this.namespaces = response.data.namespaces || []; return this.namespaces } catch (error) { this.error = error instanceof Error ? error : new Error('Failed to load namespaces'); throw error } finally { this.loading = false } },
    async fetchSecrets(namespace: string) { this.loading = true; this.error = null; try { const response = await api.get<ListResponse<SealedSecretSummary>>(`/api/v1/secrets?namespace=${encodeURIComponent(namespace)}`); this.secrets = response.data.secrets || []; return this.secrets } catch (error) { this.error = error instanceof Error ? error : new Error('Failed to load secrets'); throw error } finally { this.loading = false } },
    async fetchDetail(namespace: string, name: string) { this.loading = true; this.error = null; try { const response = await api.get<SealedSecretDetail>(`/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`); this.currentDetail = response.data; return response.data } catch (error) { this.error = error instanceof Error ? error : new Error('Failed to load secret'); throw error } finally { this.loading = false } },
    async reveal(namespace: string, name: string, key: string, baseCommit: string) { const response = await api.post<{ key: string; value: string }>(`/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/reveal`, { key, base_commit: baseCommit }); return response.data },
    // Nothing is persisted: the operator reviews the ciphertext diff, then applies it.
    async computeDiff(namespace: string, name: string, mutations: Mutation[], baseCommit: string) { const response = await api.post<EncryptedDiff>(`/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/diff`, { mutations, base_commit: baseCommit }, { 'Idempotency-Key': idempotencyKey() }); this.currentDiff = response.data; this.pendingMutation = { namespace, name, mutations: mutations.map((mutation) => ({ ...mutation })) }; return response.data },
    // Re-validates the reviewed batch against the live Secret. `currentDetail` is
    // deliberately left in place: the detail view renders "not found" whenever it is
    // null, which would take the editor and the delivery panel off the page.
    async applyReviewedMutation() { if (!this.currentDiff || !this.pendingMutation) throw new Error('No reviewed mutation'); const { namespace, name, mutations } = this.pendingMutation; const response = await api.patch<{ yaml: string; checksum: string; diff_before: string; diff_after: string }>(`/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/values`, { mutations, base_commit: this.currentDiff.base_commit }, { 'Idempotency-Key': idempotencyKey() }); this.pendingMutation = null; return response.data },
    // The server's base commit and path win: a caller-supplied path could name a file
    // whose occupancy was never verified.
    async createNewSecretDraft(namespace: string, name: string, yaml: string, scope: string, baseCommit?: string, targetPath?: string) { const response = await api.post<{ yaml: string; base_commit?: string; target_path?: string }>('/api/v1/secrets/encrypt', { namespace, name, yaml, scope, target_path: targetPath }); this.newSecretDraft = { namespace, name, scope, yaml: response.data.yaml, base_commit: baseCommit || response.data.base_commit || '', target_path: response.data.target_path || targetPath }; return this.newSecretDraft },
    discardNewSecretDraft() { this.newSecretDraft = null },
    // The server resolves repository, branch, and path.
    async dryRun(namespace: string, name: string, yaml: string, baseCommit: string, targetPath?: string) { const response = await api.post<DryRunResult>('/api/v1/gitops/dry-run', { namespace, name, yaml, base_commit: baseCommit, target_path: targetPath }, { 'Idempotency-Key': idempotencyKey() }); this.dryRunResult = response.data; return response.data },
    async deliver(namespace: string, name: string, yaml: string, baseCommit: string, targetPath?: string) { const response = await api.post<DeliveryResult>('/api/v1/gitops/deliver', { namespace, name, yaml, base_commit: baseCommit, target_path: targetPath }, { 'Idempotency-Key': idempotencyKey() }); this.deliveryResult = response.data; return response.data },
    // The push has already happened by the time the re-read runs, so a refresh that fails
    // must not surface as a failed sync — the operator would press the control again and
    // meet a base-commit conflict on a push that landed.
    async syncToGit(namespace: string, name: string, baseCommit: string) {
      const response = await api.post<DeliveryResult>('/api/v1/gitops/sync', { namespace, name, base_commit: baseCommit }, { 'Idempotency-Key': idempotencyKey() })
      try { await this.fetchDetail(namespace, name) } catch { /* reported on the next load */ }
      return response.data
    },
    async fetchGitPaths() { try { const paths = await api.getGitPaths(); this.gitPaths = paths; this.gitPathsLoaded = true; return paths } catch { this.gitPaths = null; this.gitPathsLoaded = false; return null } },
    clearSensitiveState() { this.currentDetail = null; this.currentDiff = null; this.pendingMutation = null; this.newSecretDraft = null; this.dryRunResult = null; this.deliveryResult = null },
  },
})
