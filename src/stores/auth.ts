import { defineStore } from 'pinia'
import { api } from '@/api'
import type { Capability, Namespace, User } from '@/types'

/**
 * The doc contract's /auth/me shape is namespaces with per-namespace
 * capabilities. Until the identity resolver scopes capabilities per
 * namespace, the backend returns a flat "capabilities" list; normalize
 * it into the per-namespace shape the rest of the UI consumes.
 */
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
      // Per-namespace grant when present; otherwise the flat capability
      // list from the identity resolver applies to every namespace.
      const scoped = this.user?.namespaces[namespace]
      if (scoped && scoped.length > 0) {
        return scoped.includes(capability)
      }
      return this.capabilities.includes(capability)
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
