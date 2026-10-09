import { defineStore } from 'pinia'
import { api } from '@/api'
import type { Capability, Namespace, User } from '@/types'

/**
 * The doc contract's /auth/me shape is a flat "capabilities" list plus a
 * "namespaces" map of per-namespace grants. The backend sends both; tolerate a
 * response missing the map (an older server) by defaulting it to empty, which
 * leaves the flat list as the whole answer.
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
      // Additive, matching the server's rule: the effective grant in a
      // namespace is the global set unioned with that namespace's own grants.
      // Testing the scoped list alone would drop a '*' grant for any user who
      // also has one namespace scoped to them.
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
