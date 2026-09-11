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
})
