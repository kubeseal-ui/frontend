// Types shared between stores and API responses
export interface Namespace {
  name: string
  git_managed?: boolean
  delivery_mode?: 'direct' | 'proposal'
  git_repository?: string
}

export interface GitState {
  managed: boolean
  in_sync_with_live: boolean
  drift: string
  base_commit: string
  file_path: string
  delivery_mode: 'direct' | 'proposal'
}

export interface SealedSecretSummary {
  name: string
  namespace: string
  keys: string[]
  key_count: number
  scope?: string
  created_at: string
  git: GitState
}