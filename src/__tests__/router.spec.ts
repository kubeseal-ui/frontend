// Smoke test for the kubeseal-ui frontend router.
//
// MVP only exposes a single "/" route mapping to HomeView. This test pins
// that contract so a future refactor cannot silently drop it.
import { describe, it, expect } from 'vitest'
import { router } from '../router'

describe('router', () => {
  it('exposes the home route at /', () => {
    const home = router.getRoutes().find((r) => r.name === 'home')
    expect(home).toBeDefined()
    expect(home?.path).toBe('/')
  })

  it('resolves "/" to the home route', async () => {
    await router.push('/')
    await router.isReady()
    expect(router.currentRoute.value.name).toBe('home')
    expect(router.currentRoute.value.path).toBe('/')
  })
})
