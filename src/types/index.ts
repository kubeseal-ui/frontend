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
  namespaces: Record<string, Capability[]>
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
  base_commit: string
  file_path: string
  delivery_mode: 'direct' | 'proposal'
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
