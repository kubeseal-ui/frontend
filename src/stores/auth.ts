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
    // Set once the browser is being sent into the OIDC flow, so concurrent 401s share the one
    // redirect rather than each calling location.assign.
    reauthenticating: false,
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
    // A 401 anywhere means the session is gone, so send the browser into the OIDC flow rather than
    // leaving a cleared SPA sitting on a page whose data just vanished — the bug being that a
    // runtime 401 only cleared state, and nothing re-authenticated until a hard refresh ran the
    // router guard. One-shot, so concurrent 401s share the redirect, and skipped when the
    // deployment disables it (VITE_DISABLE_LOGOUT_ON_401, for local and test runs).
    redirectToLogin() {
      if (this.reauthenticating || import.meta.env.VITE_DISABLE_LOGOUT_ON_401 === 'true') return
      this.reauthenticating = true
      window.location.assign('/api/v1/auth/login')
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
