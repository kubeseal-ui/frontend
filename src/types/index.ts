// Type barrel — no component re-exports, so each route's import graph stays small.
export type Capability =
  | 'metadata:read'
  | 'secret:seal'
  | 'secret:decrypt'
  | 'gitops:propose'
  | 'gitops:push'
  | 'access:manage'

export interface User {
  email: string
  name: string
  username: string
  // Scoped grants, unioned with the flat list below: the effective grant in a
  // namespace is capabilities ∪ namespaces[namespace]. Present, but may be empty.
  namespaces: Record<string, Capability[]>
  capabilities?: Capability[]
}

export interface Namespace {
  name: string
  capabilities: Capability[]
  delivery?: { mode: 'direct' | 'proposal' }
  git_managed?: boolean
  delivery_mode?: 'direct' | 'proposal'
  git_repository?: string
}

export interface GitState {
  managed: boolean
  in_sync_with_live: boolean
  drift: 'in-sync' | 'diverged' | 'live_only' | 'git_only' | 'unknown'
  // Present only when the Git source was read successfully.
  base_commit?: string
  file_path?: string
  repository?: string
  branch?: string
  delivery_mode?: 'direct' | 'proposal'
  // Set with `diverged` only, and only when the live Secret still matches the version the file
  // held before its last change: Git moved ahead of the cluster, so syncing would discard that.
  git_moved_ahead?: boolean
}

export interface SealedSecretSummary {
  name: string
  namespace: string
  keys?: string[]
  key_count: number
  scope?: string
  created_at: string
  git: GitState
}

export interface SealedSecretDetail extends SealedSecretSummary {
  yaml?: string
  sealed_secret_yaml?: string
}

// Ciphertext only; the plaintext Secret never enters the store.
export interface NewSecretDraft {
  namespace: string
  name: string
  scope: string
  yaml: string
  base_commit: string
  target_path?: string
}

/** Encrypted dry-run result returned by `POST /gitops/dry-run`. */
export interface DryRunResult {
  before: string
  after: string
  path: string
  base_commit: string
  mode: 'direct' | 'proposal'
  target_path?: string
}

/** Git paths configuration returned by `GET /gitops/paths`. */
export interface GitPathsConfig {
  namespaces: NamespaceGitPaths[]
}

export interface NamespaceGitPaths {
  namespace: string
  // The mapping's raw path template, e.g. `apps/{namespace}/{name}.yaml`. Raw rather than
  // rendered because a per-namespace listing has no Secret name to render `{name}` with; the
  // client substitutes it. `allowed_paths` are directories the file name is placed under —
  // the server refuses a bare directory as a destination.
  path_template: string
  allowed_paths: string[]
  repository: string
  branch: string
  mode: 'direct' | 'proposal'
}

/** The operations one entry of a reviewed batch can carry. */
export type MutationOperation = 'replace' | 'add' | 'delete'

// One entry change in a reviewed batch: one diff, one commit, so several travel
// together. `value` is empty for a delete.
export interface Mutation {
  key: string
  operation: MutationOperation
  value: string
}

// What the API echoes back for a reviewed batch — never the values, which the caller
// already holds and which have no place in a response body.
export interface MutationSummary {
  key: string
  operation: MutationOperation
}

export interface EncryptedDiff {
  before: string
  after: string
  mutations: MutationSummary[]
  base_commit: string
  checksum: string
  target_path?: string
}

export interface DeliveryResult {
  mode: 'direct' | 'proposal'
  commit_sha: string
  branch?: string
  file_path?: string
  proposal_url?: string
  argocd_sync_verified: false
}

export interface ListResponse<T> { namespaces?: T[]; secrets?: T[] }
