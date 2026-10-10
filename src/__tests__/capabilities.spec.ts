import { describe, expect, it, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'

beforeEach(() => setActivePinia(createPinia()))

describe('capability policy', () => {
  it('defaults to deny and keeps capabilities namespace-scoped', () => {
    const auth = useAuthStore()
    expect(auth.hasCapability('payments', 'metadata:read')).toBe(false)
    auth.setSession({ email: 'u@example.com', name: 'User', username: 'u', namespaces: { payments: ['metadata:read', 'secret:seal'] } })
    expect(auth.hasCapability('payments', 'metadata:read')).toBe(true)
    expect(auth.hasCapability('payments', 'secret:decrypt')).toBe(false)
    expect(auth.hasCapability('other', 'secret:seal')).toBe(false)
  })

  it('unions the global list with a namespace grant', () => {
    const auth = useAuthStore()
    auth.setSession({
      email: 'u@example.com',
      name: 'User',
      username: 'u',
      capabilities: ['metadata:read'],
      namespaces: { payments: ['secret:seal'] },
    })
    expect(auth.hasCapability('payments', 'metadata:read')).toBe(true)
    expect(auth.hasCapability('payments', 'secret:seal')).toBe(true)
    expect(auth.hasCapability('other', 'metadata:read')).toBe(true)
    expect(auth.hasCapability('other', 'secret:seal')).toBe(false)
  })

  it('answers from the global list for a user with no scoped grants', () => {
    const auth = useAuthStore()
    auth.setSession({
      email: 'u@example.com',
      name: 'User',
      username: 'u',
      capabilities: ['metadata:read', 'gitops:push'],
      namespaces: {},
    })
    expect(auth.hasCapability('payments', 'gitops:push')).toBe(true)
    expect(auth.hasCapability('development', 'gitops:push')).toBe(true)
    expect(auth.hasCapability('payments', 'secret:decrypt')).toBe(false)
  })

  it('denies a namespace-scoped-only user everywhere else', () => {
    const auth = useAuthStore()
    auth.setSession({
      email: 'u@example.com',
      name: 'User',
      username: 'u',
      capabilities: [],
      namespaces: { payments: ['metadata:read', 'secret:seal'] },
    })
    expect(auth.hasCapability('payments', 'secret:seal')).toBe(true)
    expect(auth.hasCapability('development', 'secret:seal')).toBe(false)
    expect(auth.hasCapability('development', 'metadata:read')).toBe(false)
  })
})
