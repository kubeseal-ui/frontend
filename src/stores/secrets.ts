import { defineStore } from 'pinia'
import { api } from '@/api'
import type { SealedSecretDetail, SealedSecretSummary, Namespace, DryRunResult, EncryptedDiff, DeliveryResult, ListResponse, GitPathsConfig, NamespaceGitPaths, Mutation, ChangeState, ReviewState, CheckState } from '@/types'
export type { SealedSecretDetail, SealedSecretSummary } from '@/types'

// Ciphertext only: the plaintext Secret never enters the store.
export type { ChangeState, ReviewState, CheckState, DryRunResult, DeliveryResult, GitPathsConfig, Mutation }

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

const secretPath = (namespace: string, name: string) =>
  `/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`

export const useSecretsStore = defineStore('secrets', {
  state: () => ({
    namespaces: [] as Namespace[], secrets: [] as SealedSecretSummary[], currentDetail: null as SealedSecretDetail | null,
    // The pending change and everything the three presses produce from it. One change model
    // covers an edit and a create; `review` is null for a create, which has nothing to diff.
    change: null as ChangeState | null,
    review: null as ReviewState | null,
    check: null as CheckState | null,
    delivery: null as DeliveryResult | null,
    loading: false, error: null as Error | null,
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
    async fetchDetail(namespace: string, name: string) { this.loading = true; this.error = null; try { const response = await api.get<SealedSecretDetail>(secretPath(namespace, name)); this.currentDetail = response.data; return response.data } catch (error) { this.error = error instanceof Error ? error : new Error('Failed to load secret'); throw error } finally { this.loading = false } },
    async reveal(namespace: string, name: string, key: string, baseCommit: string) { const response = await api.post<{ key: string; value: string }>(`${secretPath(namespace, name)}/reveal`, { key, base_commit: baseCommit }); return response.data },

    /** Replaces the pending change and drops anything derived from the previous one. */
    stageChange(change: ChangeState) {
      // The entries are copied, not just the array, so an editor that goes on typing into a row
      // it already staged cannot change what a press sends.
      this.change = { ...change, mutations: change.mutations.map((mutation) => ({ ...mutation })) }
      this.review = null; this.check = null; this.delivery = null
    },

    // An edit's first press. Nothing is persisted: the operator reviews the ciphertext, then
    // applies it.
    async reviewChange() {
      const change = this.change
      if (!change?.name) throw new Error('No change to review')
      const response = await api.post<EncryptedDiff>(`${secretPath(change.namespace, change.name)}/diff`, { mutations: change.mutations, base_commit: change.baseCommit }, { 'Idempotency-Key': idempotencyKey() })
      this.review = { before: response.data.before, after: response.data.after, mutations: response.data.mutations, baseCommit: response.data.base_commit, checksum: response.data.checksum, targetPath: response.data.target_path ?? change.targetPath }
      return this.review
    },

    // An edit's second press: the apply and the dry run the operator used to make separately.
    // The dry run is fed the yaml the PATCH *returned*, not the review's predicted `after`.
    // Those are different documents — the patch is what the server actually built — so checking
    // the prediction would clear a change against bytes nothing ever produced.
    async applyAndCheck() {
      const { change, review } = this
      if (!change?.name || !review) throw new Error('No reviewed change to apply')
      const applied = await api.patch<{ yaml: string; checksum: string }>(`${secretPath(change.namespace, change.name)}/values`, { mutations: change.mutations, base_commit: review.baseCommit }, { 'Idempotency-Key': idempotencyKey() })
      const dryRun = await api.post<DryRunResult>('/api/v1/gitops/dry-run', { namespace: change.namespace, name: change.name, yaml: applied.data.yaml, base_commit: review.baseCommit, target_path: review.targetPath }, { 'Idempotency-Key': idempotencyKey() })
      this.check = { yaml: applied.data.yaml, checksum: applied.data.checksum, result: dryRun.data }
      return this.check
    },

    // A create's first press: seal the pasted plaintext. The server's base commit and path win:
    // a caller-supplied path could name a file whose occupancy was never verified.
    async encryptDraft(namespace: string, name: string, yaml: string, scope: string, baseCommit = '', targetPath?: string) {
      const response = await api.post<{ yaml: string; base_commit?: string; target_path?: string }>('/api/v1/secrets/encrypt', { namespace, name, yaml, scope, target_path: targetPath })
      this.stageChange({ namespace, name, mutations: [], baseCommit: baseCommit || response.data.base_commit || '', targetPath: response.data.target_path || targetPath, scope, encrypted: response.data.yaml })
      return this.change
    },

    // A create's second press: there is no patch to apply, so the ciphertext the encrypt
    // returned is what gets checked.
    async checkDraft() {
      const change = this.change
      if (!change?.name || !change.encrypted) throw new Error('No encrypted draft to check')
      const dryRun = await api.post<DryRunResult>('/api/v1/gitops/dry-run', { namespace: change.namespace, name: change.name, yaml: change.encrypted, base_commit: change.baseCommit, target_path: change.targetPath }, { 'Idempotency-Key': idempotencyKey() })
      this.check = { yaml: change.encrypted, checksum: '', result: dryRun.data }
      return this.check
    },

    // The third press, on either path. Names the file the dry run resolved and verified — the
    // response's own `path`, which is the only destination the operator has seen a diff of.
    async deliverChange() {
      const { change, check } = this
      if (!change?.name || !check) throw new Error('Nothing checked to deliver')
      const response = await api.post<DeliveryResult>('/api/v1/gitops/deliver', { namespace: change.namespace, name: change.name, yaml: check.yaml, base_commit: check.result.base_commit, target_path: check.result.path }, { 'Idempotency-Key': idempotencyKey() })
      this.delivery = response.data
      return response.data
    },

    discardChange() { this.change = null; this.review = null; this.check = null; this.delivery = null },

    // The push has already happened by the time the re-read runs, so a refresh that fails
    // must not surface as a failed sync — the operator would press the control again and
    // meet a base-commit conflict on a push that landed.
    async syncToGit(namespace: string, name: string, baseCommit: string) {
      const response = await api.post<DeliveryResult>('/api/v1/gitops/sync', { namespace, name, base_commit: baseCommit }, { 'Idempotency-Key': idempotencyKey() })
      try { await this.fetchDetail(namespace, name) } catch { /* reported on the next load */ }
      return response.data
    },
    async fetchGitPaths() { try { const paths = await api.getGitPaths(); this.gitPaths = paths; this.gitPathsLoaded = true; return paths } catch { this.gitPaths = null; this.gitPathsLoaded = false; return null } },
    clearSensitiveState() { this.currentDetail = null; this.discardChange() },
  },
})
