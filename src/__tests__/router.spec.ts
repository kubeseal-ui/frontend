// Smoke test for the kubeseal-ui frontend router.
//
// MVP only exposes a single "home" route. Phase 3 adds the secret detail route.
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

  it('resolves "/" to the home route', async () => {
    await router.push('/')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('home')
    expect(router.currentRoute.value.path).toBe('/')
  })
})