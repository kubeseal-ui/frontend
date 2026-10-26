import { afterEach, describe, expect, it, vi } from 'vitest'
import { avatarUrl, md5 } from '@/utils/avatar'

// RFC 1321's own suite, so the hand-rolled digest is pinned to published values rather than to
// itself. The lengths run 0 to 80 bytes, which crosses the 56-byte point where the message length
// stops fitting in the final block — where an off-by-one in the padding hides.
describe('md5', () => {
  it('matches the published vectors', () => {
    const vectors: [string, string][] = [
      ['', 'd41d8cd98f00b204e9800998ecf8427e'],
      ['a', '0cc175b9c0f1b6a831c399e269772661'],
      ['abc', '900150983cd24fb0d6963f7d28e17f72'],
      ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
      ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
      ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
      ['12345678901234567890123456789012345678901234567890123456789012345678901234567890', '57edf4a22be3c955ac49da2e2107b67a'],
    ]
    for (const [input, digest] of vectors) expect(md5(input), `md5(${input})`).toBe(digest)
  })
})

describe('avatarUrl', () => {
  afterEach(() => vi.unstubAllEnvs())

  const ENDPOINT = 'https://www.gravatar.com/avatar'
  // The key for 'abc' is the published vector above, so these assert the URL the header asks for
  // rather than agreeing with the implementation about what the hash is.
  const ABC = `${ENDPOINT}/900150983cd24fb0d6963f7d28e17f72?d=404&s=52`

  it('requests nothing until a deployment names an endpoint', () => {
    expect(avatarUrl('abc')).toBe('')
  })

  it('keys the request on the hash of the address and asks for a miss, not a placeholder', () => {
    vi.stubEnv('VITE_AVATAR_ENDPOINT', ENDPOINT)
    expect(avatarUrl('abc')).toBe(ABC)
  })

  it('normalizes case and padding before hashing, the way the service keys it', () => {
    vi.stubEnv('VITE_AVATAR_ENDPOINT', ENDPOINT)
    expect(avatarUrl('  ABC  ')).toBe(ABC)
  })

  it('tolerates a trailing slash on the endpoint', () => {
    vi.stubEnv('VITE_AVATAR_ENDPOINT', `${ENDPOINT}///`)
    expect(avatarUrl('abc')).toBe(ABC)
  })

  it('has nothing to key on for an empty or blank address', () => {
    vi.stubEnv('VITE_AVATAR_ENDPOINT', ENDPOINT)
    expect(avatarUrl('')).toBe('')
    expect(avatarUrl('   ')).toBe('')
  })
})
