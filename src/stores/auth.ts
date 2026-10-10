import { defineStore } from 'pinia'
import { api } from '@/api'
import type { Capability, Namespace, User } from '@/types'

// Tolerates an older server that omits `namespaces`: without the map, the flat
// capability list is the whole answer.
function normalizeUser(raw: { email: string; name: string; username: string; capabilities?: Capability[]; namespaces?: Record<string, Capability[]> }): User {
  if (raw.namespaces) return raw as User
  return { ...raw, namespaces: {} }
}

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
    capabilities: (state): Capability[] => state.user?.capabilities ?? [],
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
      // Additive, matching the server: the effective grant is the global set unioned
      // with the namespace's own, so testing the scoped list alone would drop a '*'.
      return this.capabilities.includes(capability)
        || (this.user?.namespaces[namespace] ?? []).includes(capability)
    },
    async loadSession() {
      this.loading = true
      try {
        const response = await api.get<User>('/api/v1/auth/me')
        this.setSession(normalizeUser(response.data as never))
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
