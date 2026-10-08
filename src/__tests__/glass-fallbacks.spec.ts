// Guards for the visual layer's non-negotiable invariants (ADR-004).
//
// These assert that the rules exist, not that a browser honoured them. Whether
// an engine actually applies a fallback is a manual check; what a test can
// catch is a fallback being deleted, a palette losing a token, or the two
// copies of the dark palette drifting apart.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8')

function tokens(block: string): Record<string, string> {
  const found: Record<string, string> = {}
  for (const match of block.matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6})\s*;/gi)) found[match[1]] = match[2].toLowerCase()
  return found
}

const lightBlock = css.slice(css.indexOf(':root'), css.indexOf('}'))
const darkMediaBlock = css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/)?.[1] ?? ''
const darkOverrideBlock = css.match(/:root\[data-theme="dark"\] \{([^}]*)\}/)?.[1] ?? ''

const light = tokens(lightBlock)
const darkMedia = tokens(darkMediaBlock)
const darkOverride = tokens(darkOverrideBlock)

function regionAfter(marker: string, length = 400): string {
  const start = css.indexOf(marker)
  return start === -1 ? '' : css.slice(start, start + length)
}

describe('glass fallbacks', () => {
  it('degrades to opaque surfaces where backdrop-filter is unsupported', () => {
    const supportsMarker = '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))'
    expect(css).toContain(supportsMarker)
    const region = regionAfter(supportsMarker)
    expect(region).toContain('backdrop-filter: none')
    expect(region).toContain('var(--color-surface)')
  })

  it('honours a reduced-transparency preference', () => {
    const marker = '@media (prefers-reduced-transparency: reduce)'
    expect(css).toContain(marker)
    const region = regionAfter(marker)
    expect(region).toContain('backdrop-filter: none')
    expect(region).toContain('var(--color-surface)')
  })

  it('keeps reduced motion handling', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('removes the decorative ambient layer in both fallbacks', () => {
    for (const marker of ['@supports not ((backdrop-filter', '@media (prefers-reduced-transparency: reduce)']) {
      expect(regionAfter(marker)).toContain('body::before')
    }
  })
})

describe('palette parity', () => {
  it('declares the same token names in every palette block', () => {
    const names = Object.keys(light).sort()
    expect(names.length).toBeGreaterThan(0)
    expect(Object.keys(darkMedia).sort()).toEqual(names)
    expect(Object.keys(darkOverride).sort()).toEqual(names)
  })

  it('keeps the two copies of the dark palette identical', () => {
    // The media form cannot express a stored preference, so the dark palette is
    // declared twice. This is the assertion that stops the copies drifting.
    expect(darkOverride).toEqual(darkMedia)
  })

  it('resolves every custom property the stylesheet references', () => {
    const referenced = new Set([...css.matchAll(/var\((--[a-z-]+)\)/g)].map((match) => match[1]))
    expect(referenced.size).toBeGreaterThan(0)
    for (const token of referenced) expect(Object.keys(light)).toContain(token)
  })
})
