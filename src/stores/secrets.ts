import { defineStore } from 'pinia'
import { api } from '@/api'
import type { SealedSecretDetail, SealedSecretSummary, Namespace, DryRunResult, EncryptedDiff, DeliveryResult, ListResponse, GitPathsConfig, NamespaceGitPaths, Mutation, ChangeState, ReviewState, CheckState } from '@/types'
export type { SealedSecretDetail, SealedSecretSummary } from '@/types'

// Ciphertext only: the plaintext Secret never enters the store.
export type { ChangeState, ReviewState, CheckState, DryRunResult, DeliveryResult, GitPathsConfig, Mutation }

// A fresh key per press, except delivery: the guard endpoints refuse a reused key; the delivery press has an effect, so its key is minted once per check and reused (CheckState.idempotencyKey).
function idempotencyKey() { return crypto.randomUUID() }

// The server resolves a namespace through its own mapping then a `*` wildcard; this listing is raw, so the same fallback keeps a covered namespace from reading as unmapped.
function resolveGitPaths(config: GitPathsConfig | null, namespace: string): NamespaceGitPaths | null {
  const entries = config?.namespaces
  return entries?.find((entry) => entry.namespace === namespace)
    ?? entries?.find((entry) => entry.namespace === '*')
    ?? null
}

const secretPath = (namespace: string, name: string) =>
  `/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`

export const useSecretsStore = defineStore('secrets', {
  state: () => ({
    namespaces: [] as Namespace[], secrets: [] as SealedSecretSummary[], currentDetail: null as SealedSecretDetail | null,
    // Which namespace `secrets` describes, so two callers mounting in the same tick share one fetch.
    secretsNamespace: '' as string,
    secretsLoaded: false,
    // Separate from `loading`, which the namespaces call also sets — reading that as "secrets are coming" would be wrong.
    secretsPending: '' as string,
    // One change model covers an edit and a create; `review` is null for a create, which has nothing to diff.
    change: null as ChangeState | null,
    review: null as ReviewState | null,
    check: null as CheckState | null,
    delivery: null as DeliveryResult | null,
    loading: false, error: null as Error | null,
    gitPaths: null as GitPathsConfig | null,
    // Not derivable from `gitPaths` being null, which fetchGitPaths also stores on failure.
    gitPathsLoaded: false,
    // The strip's search index, one cross-namespace listing; names, key names, scope and drift only — nothing decrypted — so it survives clearSensitiveState() and a route change.
    index: [] as SealedSecretSummary[],
    indexLoaded: false,
    // Read by the results panel too: while the index is in flight a query has no matches *yet*, and "No Secret or key matches." would be an answer it cannot give.
    indexLoading: false,
    indexError: null as Error | null,
  }),
  getters: {
    // Prefer this over scanning `gitPaths`: a mapping stored against `*` is what the server applies to a namespace with no mapping of its own.
    namespaceGitPaths: (state) => (namespace: string): NamespaceGitPaths | null =>
      resolveGitPaths(state.gitPaths, namespace),
    namespaceDeliveryMode: (state) => (namespace: string): 'direct' | 'proposal' | '' =>
      resolveGitPaths(state.gitPaths, namespace)?.mode ?? '',
  },
  actions: {
    async fetchNamespaces() { this.loading = true; this.error = null; try { const response = await api.get<ListResponse<Namespace>>('/api/v1/namespaces'); this.namespaces = response.data.namespaces || []; return this.namespaces } catch (error) { this.error = error instanceof Error ? error : new Error('Failed to load namespaces'); throw error } finally { this.loading = false } },
    async fetchSecrets(namespace: string) {
      this.loading = true; this.error = null; this.secretsPending = namespace
      try { const response = await api.get<ListResponse<SealedSecretSummary>>(`/api/v1/secrets?namespace=${encodeURIComponent(namespace)}`); this.secrets = response.data.secrets || []; this.secretsNamespace = namespace; this.secretsLoaded = true; return this.secrets } catch (error) { this.error = error instanceof Error ? error : new Error('Failed to load secrets'); throw error } finally { this.loading = false; this.secretsPending = '' }
    },

    /** Cached by namespace; an empty listing is a loaded one, which is why this needs the flag. A caller arriving while the same namespace is in flight joins it instead of issuing a second request. */
    async ensureSecrets(namespace: string) {
      if (this.secretsNamespace === namespace && this.secretsLoaded) return this.secrets
      if (this.secretsPending === namespace) return this.secrets
      return this.fetchSecrets(namespace)
    },

    /** The strip's index. A failed index must not blank the page the strip merely sits above, so it does not share `loading`/`error`. */
    async fetchIndex() {
      this.indexError = null
      this.indexLoading = true
      try {
        const response = await api.get<ListResponse<SealedSecretSummary>>('/api/v1/secrets')
        this.index = response.data.secrets || []
        this.indexLoaded = true
        return this.index
      } catch (error) {
        this.indexError = error instanceof Error ? error : new Error('Failed to load secrets')
        this.indexLoaded = false
        throw error
      } finally {
        this.indexLoading = false
      }
    },
    async fetchDetail(namespace: string, name: string) { this.loading = true; this.error = null; try { const response = await api.get<SealedSecretDetail>(secretPath(namespace, name)); this.currentDetail = response.data; return response.data } catch (error) { this.error = error instanceof Error ? error : new Error('Failed to load secret'); throw error } finally { this.loading = false } },
    async reveal(namespace: string, name: string, key: string, baseCommit: string) { const response = await api.post<{ key: string; value: string }>(`${secretPath(namespace, name)}/reveal`, { key, base_commit: baseCommit }); return response.data },

    /** Replaces the pending change and drops anything derived from the previous one. */
    stageChange(change: ChangeState) {
      // Copied entry by entry, so an editor typing into a row it already staged cannot change what a press sends.
      this.change = { ...change, mutations: change.mutations.map((mutation) => ({ ...mutation })) }
      this.review = null; this.check = null; this.delivery = null
    },

    // An edit's first press. Nothing is persisted: the operator reviews the ciphertext, then applies it.
    async reviewChange() {
      const change = this.change
      if (!change?.name) throw new Error('No change to review')
      const response = await api.post<EncryptedDiff>(`${secretPath(change.namespace, change.name)}/diff`, { mutations: change.mutations, base_commit: change.baseCommit }, { 'Idempotency-Key': idempotencyKey() })
      this.review = { before: response.data.before, after: response.data.after, mutations: response.data.mutations, baseCommit: response.data.base_commit, checksum: response.data.checksum, targetPath: response.data.target_path ?? change.targetPath }
      return this.review
    },

    // An edit's second press. The dry run is fed the yaml the PATCH *returned*, not the review's predicted `after` — they are different documents, and checking the prediction would clear a change against bytes nothing ever produced.
    async applyAndCheck() {
      const { change, review } = this
      if (!change?.name || !review) throw new Error('No reviewed change to apply')
      const applied = await api.patch<{ yaml: string; checksum: string }>(`${secretPath(change.namespace, change.name)}/values`, { mutations: change.mutations, base_commit: review.baseCommit }, { 'Idempotency-Key': idempotencyKey() })
      const dryRun = await api.post<DryRunResult>('/api/v1/gitops/dry-run', { namespace: change.namespace, name: change.name, yaml: applied.data.yaml, base_commit: review.baseCommit, target_path: review.targetPath }, { 'Idempotency-Key': idempotencyKey() })
      this.check = { yaml: applied.data.yaml, checksum: applied.data.checksum, result: dryRun.data, idempotencyKey: idempotencyKey() }
      return this.check
    },

    // A create's first press. The server's base commit and path win: a caller-supplied path could name a file whose occupancy was never verified.
    async encryptDraft(namespace: string, name: string, yaml: string, scope: string, baseCommit = '', targetPath?: string) {
      const response = await api.post<{ yaml: string; base_commit?: string; target_path?: string }>('/api/v1/secrets/encrypt', { namespace, name, yaml, scope, target_path: targetPath })
      this.stageChange({ namespace, name, mutations: [], baseCommit: baseCommit || response.data.base_commit || '', targetPath: response.data.target_path || targetPath, scope, encrypted: response.data.yaml })
      return this.change
    },

    // A create's second press: no patch to apply, so the ciphertext the encrypt returned is what gets checked.
    async checkDraft() {
      const change = this.change
      if (!change?.name || !change.encrypted) throw new Error('No encrypted draft to check')
      const dryRun = await api.post<DryRunResult>('/api/v1/gitops/dry-run', { namespace: change.namespace, name: change.name, yaml: change.encrypted, base_commit: change.baseCommit, target_path: change.targetPath }, { 'Idempotency-Key': idempotencyKey() })
      this.check = { yaml: change.encrypted, checksum: '', result: dryRun.data, idempotencyKey: idempotencyKey() }
      return this.check
    },

    // Names the file the dry run resolved and verified — the response's own `path`, the only destination the operator has seen a diff of.
    async deliverChange() {
      const { change, check } = this
      if (!change?.name || !check) throw new Error('Nothing checked to deliver')
      const response = await api.post<DeliveryResult>('/api/v1/gitops/deliver', { namespace: change.namespace, name: change.name, yaml: check.yaml, base_commit: check.result.base_commit, target_path: check.result.path }, { 'Idempotency-Key': check.idempotencyKey })
      this.delivery = response.data
      // The workflow is spent: re-offering this batch would stage a change already in Git, and the review's `after` is a different encryption of the same values. `check` stays — it is the bytes that were written.
      this.change = null; this.review = null
      return response.data
    },

    discardChange() { this.change = null; this.review = null; this.check = null; this.delivery = null },

    /** Drops the review and the check but keeps the staged change, returning the workflow to its first step. Used when a row is edited after reviewing, and by the surface's rail. The delivery is left alone: a landed delivery is a result to keep showing. */
    discardReview() { this.review = null; this.check = null },

    // The push has already happened by the time the re-read runs, so a refresh that fails must not surface as a failed sync — the operator would meet a base-commit conflict on a push that landed.
    async syncToGit(namespace: string, name: string, baseCommit: string) {
      const response = await api.post<DeliveryResult>('/api/v1/gitops/sync', { namespace, name, base_commit: baseCommit }, { 'Idempotency-Key': idempotencyKey() })
      try { await this.fetchDetail(namespace, name) } catch { /* reported on the next load */ }
      return response.data
    },
    async fetchGitPaths() { try { const paths = await api.getGitPaths(); this.gitPaths = paths; this.gitPathsLoaded = true; return paths } catch { this.gitPaths = null; this.gitPathsLoaded = false; return null } },
    clearSensitiveState() { this.currentDetail = null; this.discardChange() },
  },
})
