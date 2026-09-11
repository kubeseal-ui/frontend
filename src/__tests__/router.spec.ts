// Smoke test for the kubeseal-ui frontend router.
//
// MVP only exposes a single "home" route. Phase 3 adds the secret detail route.
import { describe, it, expect } from 'vitest'
import { router } from '../router'

describe('router', () => {
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