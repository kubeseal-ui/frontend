import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '@/api'
import { useAuthStore } from '@/stores/auth'

beforeEach(() => { setActivePinia(createPinia()); vi.restoreAllMocks() })

describe('phase 2 auth integration', () => {
  it('loads session from /auth/me on successful request', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { email: 'user@example.com', name: 'User', username: 'user', namespaces: { payments: ['metadata:read', 'secret:seal', 'secret:decrypt'] } } } as never)
    const store = useAuthStore()
    await store.loadSession()
    expect(store.isAuthenticated).toBe(true)
    expect(store.activeNamespace).toBe('payments')
    expect(store.namespaces).toHaveLength(1)
    expect(store.namespaces[0].capabilities).toContain('secret:seal')
  })

  it('clears session on 401 response', async () => {
    vi.spyOn(api, 'get').mockRejectedValue({ status: 401 })
    const store = useAuthStore()
    store.setSession({ email: 'test', name: 'Test', username: 'test', namespaces: {} })
    await store.loadSession().catch(() => {})
    expect(store.isAuthenticated).toBe(false)
    expect(store.activeNamespace).toBeNull()
  })

  it('selects first namespace when active namespace becomes invalid', async () => {
    const store = useAuthStore()
    store.setSession({ email: 'user@example.com', name: 'User', username: 'user', namespaces: { first: ['metadata:read'], second: ['secret:seal'] } })
    store.activeNamespace = 'second'
    store.setSession({ email: 'user@example.com', name: 'User', username: 'user', namespaces: { only: ['metadata:read'] } })
    expect(store.activeNamespace).toBe('only')
  })
})
