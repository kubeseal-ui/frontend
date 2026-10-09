import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia } from 'pinia'
import { useAuthStore } from '../stores/auth'
import { router } from '../router'
import { pinia } from '../pinia'

describe('router', () => {
  beforeEach(() => {
    setActivePinia(pinia)
    useAuthStore(pinia).setSession({ email: 'test@example.com', name: 'Test', username: 'test', namespaces: {} })
  })
  it('exposes the home route at /', () => {
    const home = router.getRoutes().find((r) => r.name === 'home')
    expect(home).toBeDefined()
    expect(home?.path).toBe('/')
  })

  it('exposes the secret detail route at /secrets/:namespace/:name', () => {
    const secretDetail = router.getRoutes().find((r) => r.name === 'secret-detail')
    expect(secretDetail).toBeDefined()
    expect(secretDetail?.path).toBe('/secrets/:namespace/:name')
  })

  // Creating acts on the namespace, not an existing Secret, so it is not under /secrets/.
  it('exposes the new-secret route at /namespaces/:namespace/new', () => {
    const newSecret = router.getRoutes().find((r) => r.name === 'new-secret')
    expect(newSecret).toBeDefined()
    expect(newSecret?.path).toBe('/namespaces/:namespace/new')
  })

  it('resolves "/" to the home route', async () => {
    await router.push('/')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('home')
    expect(router.currentRoute.value.path).toBe('/')
  })
})