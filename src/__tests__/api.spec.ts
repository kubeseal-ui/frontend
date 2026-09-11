import { describe, expect, it, vi, beforeEach } from 'vitest'
import { api } from '@/api'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'

beforeEach(() => { setActivePinia(createPinia()); vi.restoreAllMocks(); document.cookie = 'kubeseal_csrf=csrf-test' })

describe('API client', () => {
  it('sends cookies and CSRF on state-changing requests', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await api.post('/api/v1/example', { value: 'encrypted-only' })
    const request = fetchMock.mock.calls[0][1] as RequestInit
    expect(request.credentials).toBe('include')
    expect(new Headers(request.headers).get('X-CSRF-Token')).toBe('csrf-test')
    expect(new Headers(request.headers).get('Content-Type')).toBe('application/json')
  })

  it('converts error envelopes into typed errors and clears sessions on 401', async () => {
    const auth = useAuthStore()
    auth.setSession({ email: 'user@example.com', name: 'User', username: 'user', namespaces: {} })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { code: 'CAPABILITY_DENIED', message: 'Access denied' } }), { status: 401 }))
    await expect(api.get('/api/v1/namespaces')).rejects.toMatchObject({ status: 401, code: 'CAPABILITY_DENIED' })
    expect(auth.isAuthenticated).toBe(false)
  })
})
