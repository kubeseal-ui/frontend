import { beforeEach, describe, expect, it } from 'vitest'
import { consumeReturnPath, rememberReturnPath } from '@/utils/returnPath'

beforeEach(() => {
  window.sessionStorage.clear()
})

describe('return path across an auth redirect', () => {
  it('remembers a local path and gives it back exactly once', () => {
    rememberReturnPath('/secrets/tools/outline-cred')
    expect(consumeReturnPath()).toBe('/secrets/tools/outline-cred')
    // Consume-once: a later, unrelated boot must not be yanked to a stale path.
    expect(consumeReturnPath()).toBeNull()
  })

  it('refuses anything that could leave the origin', () => {
    rememberReturnPath('https://evil.example.com/')
    expect(consumeReturnPath()).toBeNull()
    rememberReturnPath('//evil.example.com')
    expect(consumeReturnPath()).toBeNull()
  })

  it('returns null when nothing was remembered', () => {
    expect(consumeReturnPath()).toBeNull()
  })
})
