// Auth store: handles OIDC session state and capability authorization.
// Mirrors the backend Identity type and capability checks.
import { defineStore } from 'pinia'

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

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
  }),
  getters: {
    isAuthenticated: (state) => state.user !== null,
  },
  actions: {
    setSession(user: User) {
      this.user = user
    },
    clearSession() {
      this.user = null
    },
    hasCapability(namespace: string, capability: Capability): boolean {
      if (!this.user) return false
      return this.user.namespaces[namespace]?.includes(capability) ?? false
    },
  },
})