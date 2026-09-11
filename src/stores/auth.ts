import { defineStore } from 'pinia'
import { api } from '@/api'
import type { Capability, Namespace, User } from '@/types'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    activeNamespace: null as string | null,
    loading: false,
  }),
  getters: {
    isAuthenticated: (state) => state.user !== null,
    namespaces: (state): Namespace[] => Object.entries(state.user?.namespaces ?? {}).map(([name, capabilities]) => ({
      name,
      capabilities,
    })),
  },
  actions: {
    setSession(user: User) {
      this.user = user
      if (!this.activeNamespace || !user.namespaces[this.activeNamespace]) {
        this.activeNamespace = Object.keys(user.namespaces)[0] ?? null
      }
    },
    clearSession() {
      this.user = null
      this.activeNamespace = null
    },
    hasCapability(namespace: string, capability: Capability): boolean {
      return this.user?.namespaces[namespace]?.includes(capability) ?? false
    },
    async loadSession() {
      this.loading = true
      try {
        const response = await api.get<User>('/api/v1/auth/me')
        this.setSession(response.data)
        return response.data
      } catch (error) {
        this.clearSession()
        throw error
      } finally {
        this.loading = false
      }
    },
    async logout() {
      try {
        await api.post('/api/v1/auth/logout', {})
      } finally {
        this.clearSession()
      }
    },
  },
})
