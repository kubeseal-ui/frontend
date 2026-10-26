// Gravatar/Libravatar key on md5(lowercase(trim(email))); the browser has no MD5, so it lives below. Opt-in via VITE_AVATAR_ENDPOINT (default off) — the endpoint never learns the address.

/** 2× the header's 26px circle, so the image is sharp on a dense display. */
const SIZE = 52

/** The avatar for an email, or '' when avatars are off. The endpoint must answer `/avatar/<md5>` and honour `d=404`, whose miss is what lets the header fall back to the initials. */
export function avatarUrl(email: string): string {
  // Read per call rather than into a module constant, so a test can exercise both states.
  const endpoint = (import.meta.env.VITE_AVATAR_ENDPOINT ?? '').replace(/\/+$/, '')
  const key = email.trim().toLowerCase()
  if (!endpoint || !key) return ''
  return `${endpoint}/${md5(key)}?d=404&s=${SIZE}`
}

// RFC 1321 §3.4, fixed for all time: the per-round shift amounts and the sine-derived constants.
const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

const K = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
]

/** MD5 of a UTF-8 string, 32 lowercase hex; exported for its test vectors — the avatar key and nothing else. */
export function md5(input: string): string {
  const bytes = new TextEncoder().encode(input)
  // The length occupies the last 8 bytes of the final block, so a message with fewer than 9 bytes left in its block needs another one.
  const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  const bits = bytes.length * 8
  view.setUint32(padded.length - 8, bits >>> 0, true)
  view.setUint32(padded.length - 4, Math.floor(bits / 0x100000000), true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  for (let offset = 0; offset < padded.length; offset += 64) {
    let a = a0
    let b = b0
    let c = c0
    let d = d0
    for (let i = 0; i < 64; i++) {
      // One of four round functions, each with its own word order and shift schedule.
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (b & d) | (c & ~d)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      const sum = (a + f + K[i] + view.getUint32(offset + g * 4, true)) >>> 0
      const shift = SHIFTS[i]
      const rotated = ((sum << shift) | (sum >>> (32 - shift))) >>> 0
      a = d
      d = c
      c = b
      b = (b + rotated) >>> 0
    }
    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  return [a0, b0, c0, d0].map(littleEndianHex).join('')
}

/** One word as the four bytes MD5 prints it in: least significant first. */
function littleEndianHex(word: number): string {
  let out = ''
  for (let i = 0; i < 4; i++) out += ((word >>> (i * 8)) & 0xff).toString(16).padStart(2, '0')
  return out
}
