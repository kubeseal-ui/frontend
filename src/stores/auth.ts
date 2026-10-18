import { defineStore } from 'pinia'
import { api } from '@/api'
import { useSecretsStore } from '@/stores/secrets'
import { rememberReturnPath } from '@/utils/returnPath'
import type { Capability, Namespace, User } from '@/types'

// Tolerates an older server that omits `namespaces`: without the map, the flat capability list is the whole answer.
function normalizeUser(raw: { email: string; name: string; username: string; capabilities?: Capability[]; namespaces?: Record<string, Capability[]> }): User {
  if (raw.namespaces) return raw as User
  return { ...raw, namespaces: {} }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    activeNamespace: null as string | null,
    loading: false,
    // Set once the browser is being sent into the OIDC flow, so concurrent 401s share the one redirect.
    reauthenticating: false,
    // Set by an explicit sign-out, so a 401 still in flight cannot drag the browser straight back into the OIDC flow — the SSO session would log them in again and sign-out would look like a no-op.
    signedOut: false,
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
      this.signedOut = false
      if (!this.activeNamespace || !user.namespaces[this.activeNamespace]) {
        this.activeNamespace = Object.keys(user.namespaces)[0] ?? null
      }
    },
    clearSession() {
      this.user = null
      this.activeNamespace = null
      // The session's data does not outlive it: without this the cached listing still answers the search strip on the signed-out page.
      useSecretsStore().$reset()
    },
    // A 401 anywhere means the session is gone; one-shot so concurrent 401s share the redirect, skipped when VITE_DISABLE_LOGOUT_ON_401 is set.
    redirectToLogin() {
      if (this.signedOut || this.reauthenticating || import.meta.env.VITE_DISABLE_LOGOUT_ON_401 === 'true') return
      this.reauthenticating = true
      // Remember where they were so the callback returns them here, not to the app root.
      rememberReturnPath(window.location.pathname + window.location.search)
      window.location.assign('/api/v1/auth/login')
    },
    hasCapability(namespace: string, capability: Capability): boolean {
      // Additive, matching the server: the effective grant is the global set unioned with the namespace's own.
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
      // Before the request, not after: the cleared cookie can make this very call 401, and the flag has to be in place before that response lands.
      this.signedOut = true
      try {
        await api.post('/api/v1/auth/logout', {})
      } finally {
        this.clearSession()
      }
    },
  },
})
