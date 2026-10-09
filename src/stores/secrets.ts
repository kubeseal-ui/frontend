import { defineStore } from 'pinia'
import { api } from '@/api'
import type { SealedSecretDetail, SealedSecretSummary, Namespace, DryRunResult, EncryptedDiff, DeliveryResult, NewSecretDraft, ListResponse, GitPathsConfig, NamespaceGitPaths, Mutation } from '@/types'
export type { SealedSecretDetail, SealedSecretSummary } from '@/types'

/** Ciphertext-only draft for a brand new SealedSecret. The plaintext Secret never enters the store. */
export type { NewSecretDraft, DryRunResult, EncryptedDiff, DeliveryResult, GitPathsConfig, Mutation }

function idempotencyKey() { return crypto.randomUUID() }

/**
 * The Git path entry that applies to one namespace.
 *
 * The server resolves a namespace through its own mapping first and then
 * through a `*` wildcard — `PolicyStore.GetGitMapping` rewrites the wildcard's
 * namespace on the way out — which is how a single mapping covers every
 * namespace. This listing is the raw store, so a wildcard arrives as the
 * literal entry `namespace: "*"` with nothing expanded around it, and a
 * namespace it covers has no entry of its own. Without the same fallback here
 * the UI reads a covered namespace as unmapped and refuses to deliver for one
 * the server would happily accept.
 *
 * The fallback is deliberately in the store rather than at each call site:
 * four consumers read this listing and every one of them needs the same
 * answer the server would give.
 */
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
    /**
     * The batch the reviewed diff was computed for, with the Secret it belongs
     * to. It is kept so the apply step sends exactly what was reviewed rather
     * than whatever the editor happens to hold by the time the operator
     * confirms — the review would be meaningless otherwise.
     */
    pendingMutation: null as { namespace: string; name: string; mutations: Mutation[] } | null,
    newSecretDraft: null as NewSecretDraft | null,
    dryRunResult: null as DryRunResult | null,
    deliveryResult: null as DeliveryResult | null, loading: false, error: null as Error | null,
    gitPaths: null as GitPathsConfig | null,
    /**
     * Whether the Git path listing was actually fetched.
     *
     * It is not derivable from `gitPaths` being null, because fetchGitPaths
     * stores null on failure as well as on an empty answer. A consumer that
     * reads the two as the same thing ends up stating a fact it does not have
     * — see the namespace card, which would otherwise report "no Git mapping"
     * for a namespace whose listing merely failed to load.
     */
    gitPathsLoaded: false,
  }),
  getters: {
    /**
     * The Git path listing entry for a namespace, wildcard included.
     *
     * Prefer this over scanning `gitPaths` directly: a mapping stored against
     * `*` is what the server applies to a namespace with no mapping of its own,
     * and a raw scan cannot see that.
     */
    namespaceGitPaths: (state) => (namespace: string): NamespaceGitPaths | null =>
      resolveGitPaths(state.gitPaths, namespace),
    /**
     * The fixed delivery mode for a namespace, from the Git path listing.
     *
     * Delivery mode is never a user choice — it comes from the authorization
     * ConfigMap via the server. This exists so the delivery panel can resolve
     * it for a Secret that does not exist yet and therefore has no detail.
     */
    namespaceDeliveryMode: (state) => (namespace: string): 'direct' | 'proposal' | '' =>
      resolveGitPaths(state.gitPaths, namespace)?.mode ?? '',
  },
  actions: {
    async fetchNamespaces() { this.loading = true; this.error = null; try { const response = await api.get<ListResponse<Namespace>>('/api/v1/namespaces'); this.namespaces = response.data.namespaces || []; return this.namespaces } catch (error) { this.error = error instanceof Error ? error : new Error('Failed to load namespaces'); throw error } finally { this.loading = false } },
    async fetchSecrets(namespace: string) { this.loading = true; this.error = null; try { const response = await api.get<ListResponse<SealedSecretSummary>>(`/api/v1/secrets?namespace=${encodeURIComponent(namespace)}`); this.secrets = response.data.secrets || []; return this.secrets } catch (error) { this.error = error instanceof Error ? error : new Error('Failed to load secrets'); throw error } finally { this.loading = false } },
    async fetchDetail(namespace: string, name: string) { this.loading = true; this.error = null; try { const response = await api.get<SealedSecretDetail>(`/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`); this.currentDetail = response.data; return response.data } catch (error) { this.error = error instanceof Error ? error : new Error('Failed to load secret'); throw error } finally { this.loading = false } },
    async reveal(namespace: string, name: string, key: string, baseCommit: string) { const response = await api.post<{ key: string; value: string }>(`/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/reveal`, { key, base_commit: baseCommit }); return response.data },
    /**
     * Asks the server for the encrypted before/after of a whole batch of entry
     * changes. Nothing is persisted: the operator reviews the ciphertext diff
     * and only then calls applyReviewedMutation.
     *
     * One batch is one reviewed change, so the editor submits everything it has
     * staged at once rather than a key per round trip.
     */
    async computeDiff(namespace: string, name: string, mutations: Mutation[], baseCommit: string) { const response = await api.post<EncryptedDiff>(`/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/diff`, { mutations, base_commit: baseCommit }, { 'Idempotency-Key': idempotencyKey() }); this.currentDiff = response.data; this.pendingMutation = { namespace, name, mutations: mutations.map((mutation) => ({ ...mutation })) }; return response.data },
    /**
     * Confirms the batch that was just reviewed by having the server reseal it
     * against the live Secret.
     *
     * Nothing is persisted — not Kubernetes, not Git — so there is no state
     * downstream of it that goes stale, and the detail the page is rendering
     * from is deliberately left in place. Clearing it here would take the
     * editor and the delivery panel off the page with it, since the detail view
     * renders "not found" whenever `currentDetail` is null, leaving an operator
     * who has just confirmed a patch with no way to dry-run or deliver it.
     *
     * What reaches the repository is the ciphertext reviewed in `currentDiff`,
     * which the panel sends to delivery directly. This call exists so the batch
     * is re-validated against the live Secret at the moment the operator
     * commits to it, rather than only when it was staged.
     *
     * The keys travel in the body rather than a path segment, because a batch
     * has no single key to name in a URL.
     */
    async applyReviewedMutation() { if (!this.currentDiff || !this.pendingMutation) throw new Error('No reviewed mutation'); const { namespace, name, mutations } = this.pendingMutation; const response = await api.patch<{ yaml: string; checksum: string; diff_before: string; diff_after: string }>(`/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/values`, { mutations, base_commit: this.currentDiff.base_commit }, { 'Idempotency-Key': idempotencyKey() }); this.pendingMutation = null; return response.data },
    /**
     * Encrypts a complete new Secret and hands the ciphertext to the shared
     * review/delivery state.
     *
     * The base commit is the branch head the server verified the mapped path
     * against, so it is taken from the encrypt response. An explicit argument
     * still wins, which is how the detail page passes the head it already
     * holds; the create page passes nothing and uses the server's value.
     *
     * The path is stored for the same reason, and the server's answer wins
     * there too: it is the path the vacancy check actually read. Dropping it
     * would send delivery back to the mapping's rendered path, which for an
     * operator who picked another allowed path is a file whose occupancy was
     * never checked.
     */
    async createNewSecretDraft(namespace: string, name: string, yaml: string, scope: string, baseCommit?: string, targetPath?: string) { const response = await api.post<{ yaml: string; base_commit?: string; target_path?: string }>('/api/v1/secrets/encrypt', { namespace, name, yaml, scope, target_path: targetPath }); this.newSecretDraft = { namespace, name, scope, yaml: response.data.yaml, base_commit: baseCommit || response.data.base_commit || '', target_path: response.data.target_path || targetPath }; return this.newSecretDraft },
    discardNewSecretDraft() { this.newSecretDraft = null },
    /** Server-side Git dry-run for the reviewed ciphertext. The server resolves repository, branch, and path. */
    async dryRun(namespace: string, name: string, yaml: string, baseCommit: string, targetPath?: string) { const response = await api.post<DryRunResult>('/api/v1/gitops/dry-run', { namespace, name, yaml, base_commit: baseCommit, target_path: targetPath }, { 'Idempotency-Key': idempotencyKey() }); this.dryRunResult = response.data; return response.data },
    async deliver(namespace: string, name: string, yaml: string, baseCommit: string, targetPath?: string) { const response = await api.post<DeliveryResult>('/api/v1/gitops/deliver', { namespace, name, yaml, base_commit: baseCommit, target_path: targetPath }, { 'Idempotency-Key': idempotencyKey() }); this.deliveryResult = response.data; return response.data },
    /**
     * Copies the live Secret into Git, then re-reads the state the page is
     * rendering from.
     *
     * The push is the operation, and it has already happened by the time the
     * re-read runs: a refresh that fails afterwards must not be reported as a
     * failed sync, because the operator's next move would be to press the
     * control again and meet a base-commit conflict on a push that landed. The
     * next load re-reads the state anyway.
     */
    async syncToGit(namespace: string, name: string, baseCommit: string) {
      const response = await api.post<DeliveryResult>('/api/v1/gitops/sync', { namespace, name, base_commit: baseCommit }, { 'Idempotency-Key': idempotencyKey() })
      try { await this.fetchDetail(namespace, name) } catch { /* reported on the next load */ }
      return response.data
    },
    async fetchGitPaths() { try { const paths = await api.getGitPaths(); this.gitPaths = paths; this.gitPathsLoaded = true; return paths } catch { this.gitPaths = null; this.gitPathsLoaded = false; return null } },
    clearSensitiveState() { this.currentDetail = null; this.currentDiff = null; this.pendingMutation = null; this.newSecretDraft = null; this.dryRunResult = null; this.deliveryResult = null },
  },
})
