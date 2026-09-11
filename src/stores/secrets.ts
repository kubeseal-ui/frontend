// Secrets store: metadata, encrypted diffs, and delivery results only.
import { defineStore } from 'pinia'
import { api } from '@/api'
import type { Capability } from '@/stores/auth'

export interface GitState {
  managed: boolean
  in_sync_with_live: boolean
  drift: string // "in-sync", "diverged", or "unknown"
  base_commit: string
  file_path: string
  delivery_mode: 'direct' | 'proposal'
}

// SealedSecretDetail matches the backend API response for a single secret detail.
// The backend returns: name, namespace, scope, keys, key_count, created_at, git, sealed_secret_yaml.
export interface SealedSecretDetail {
  name: string
  namespace: string
  keys: string[]
  key_count: number
  created_at: string
  scope?: string
  yaml?: string
  git: GitState
  capabilities?: Capability[]
}

// Backend API response for secret list items (metadata-only, no yaml).
export interface SealedSecretSummary {
  name: string
  namespace: string
  scope?: string
  key_count: number
  created_at: string
  git: GitState
}

export const useSecretsStore = defineStore('secrets', {
  state: () => ({
    currentDetail: null as SealedSecretDetail | null,
    currentDiff: null as { before: string; after: string; checksum: string } | null,
  }),
  actions: {
    async fetchDetail(namespace: string, name: string) {
      const response = await api.get<SealedSecretDetail>(`/api/v1/secrets/${namespace}/${name}`)
      this.currentDetail = response.data
      return response.data
    },

    async reveal(namespace: string, name: string, key: string, baseCommit: string) {
      const response = await api.post<{ key: string; value: string }>(
        `/api/v1/secrets/${namespace}/${name}/reveal`,
        { key, base_commit: baseCommit }
      )
      return response.data
    },

    async computeDiff(
      namespace: string,
      name: string,
      key: string,
      operation: 'replace' | 'add' | 'delete',
      value: string,
      baseCommit: string
    ) {
      const response = await api.post<{ before: string; after: string; key: string; base_commit: string; checksum: string }>(
        `/api/v1/secrets/${namespace}/${name}/diff`,
        { key, operation, value, base_commit: baseCommit }
      )
      this.currentDiff = { before: response.data.before, after: response.data.after, checksum: response.data.checksum }
      return response.data
    },

    async reseal(
      namespace: string,
      name: string,
      key: string,
      value: string,
      baseCommit: string,
      operation: 'replace' | 'add' | 'delete'
    ) {
      const response = await api.patch<{ yaml: string; checksum: string }>(
        `/api/v1/secrets/${namespace}/${name}/values/${encodeURIComponent(key)}`,
        { value, base_commit: baseCommit, operation }
      )
      return response.data
    },
  },
})