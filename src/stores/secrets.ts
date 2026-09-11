import { defineStore } from 'pinia'
import { api } from '@/api'
import type { SealedSecretDetail, SealedSecretSummary, Namespace } from '@/types'
export type { SealedSecretDetail, SealedSecretSummary } from '@/types'

export const useSecretsStore = defineStore('secrets', {
  state: () => ({
    namespaces: [] as Namespace[],
    secrets: [] as SealedSecretSummary[],
    currentDetail: null as SealedSecretDetail | null,
    loading: false,
    error: null as Error | null,
  }),
  actions: {
    async fetchNamespaces() {
      this.loading = true
      this.error = null
      try {
        const response = await api.get<Namespace[]>('/api/v1/namespaces')
        this.namespaces = response.data
        return response.data
      } catch (error) {
        this.error = error instanceof Error ? error : new Error('Failed to load namespaces')
        throw error
      } finally {
        this.loading = false
      }
    },
    async fetchSecrets(namespace: string) {
      this.loading = true
      this.error = null
      try {
        const response = await api.get<SealedSecretSummary[]>(`/api/v1/secrets?namespace=${encodeURIComponent(namespace)}`)
        this.secrets = response.data
        return response.data
      } catch (error) {
        this.error = error instanceof Error ? error : new Error('Failed to load secrets')
        throw error
      } finally {
        this.loading = false
      }
    },
    async fetchDetail(namespace: string, name: string) {
      this.loading = true
      this.error = null
      try {
        const response = await api.get<SealedSecretDetail>(`/api/v1/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`)
        this.currentDetail = response.data
        return response.data
      } catch (error) {
        this.error = error instanceof Error ? error : new Error('Failed to load secret')
        throw error
      } finally {
        this.loading = false
      }
    },
    clearSensitiveState() {
      this.currentDetail = null
    },
  },
})
