import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from '@/stores/auth'
import { setActivePinia, createPinia } from 'pinia'

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('auth store', () => {
  it('has correct initial state', () => {
    const store = useAuthStore()
    expect(store.user).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  it('can set and clear session', () => {
    const store = useAuthStore()
    store.setSession({
      email: 'test@example.com',
      name: 'Test User',
      username: 'testuser',
      namespaces: { default: ['metadata:read'] },
    })
    expect(store.user?.email).toBe('test@example.com')
    expect(store.isAuthenticated).toBe(true)
    store.clearSession()
    expect(store.user).toBeNull()
  })

  it('checks capability correctly', () => {
    const store = useAuthStore()
    store.setSession({
      email: 'test@example.com',
      name: 'Test User',
      username: 'testuser',
      namespaces: { default: ['secret:seal', 'secret:decrypt'] },
    })
    expect(store.hasCapability('default', 'secret:seal')).toBe(true)
    expect(store.hasCapability('default', 'secret:decrypt')).toBe(true)
    expect(store.hasCapability('default', 'metadata:read')).toBe(false)
    expect(store.hasCapability('other', 'secret:seal')).toBe(false)
  })
})