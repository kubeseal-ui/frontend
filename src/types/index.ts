// Type barrel — no component re-exports. Components are imported from their
// own files to keep each route's import graph small and avoid pulling the
// editor tree into unrelated modules.
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
  // Per-namespace grants (doc contract). Empty until the backend scopes
  // capabilities per namespace; the flat list applies to every namespace.
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
  drift: 'in-sync' | 'diverged' | 'unknown'
  // Present only when the Git source was read successfully.
  base_commit?: string
  file_path?: string
  repository?: string
  branch?: string
  delivery_mode?: 'direct' | 'proposal'
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

/** Ciphertext-only draft for a brand new SealedSecret. The plaintext Secret never enters the store. */
export interface NewSecretDraft {
  namespace: string
  name: string
  scope: string
  yaml: string
  base_commit: string
}

/** Encrypted dry-run result returned by `POST /gitops/dry-run`. */
export interface DryRunResult {
  before: string
  after: string
  path: string
  base_commit: string
  mode: 'direct' | 'proposal'
}

export interface EncryptedDiff {
  before: string
  after: string
  key: string
  base_commit: string
  checksum: string
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
