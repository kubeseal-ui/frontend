// Guards for the visual layer's invariants (ADR-004). These assert the rules exist, not
// that a browser honoured them; what a test can catch is a fallback deleted, a palette
// losing a token, the two copies of the dark palette drifting, or the two halves of the
// lens — the CSS that references the filter and the SVG that defines it — losing each
// other.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8')
const shell = readFileSync(resolve(process.cwd(), 'src/components/AppShell.vue'), 'utf8')

/** The colour declarations in a block; hex and rgb() forms both count. */
function tokens(block: string): Record<string, string> {
  const found: Record<string, string> = {}
  for (const match of block.matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6}|rgba?\([^)]*\))\s*;/gi)) {
    found[match[1]] = match[2].toLowerCase().replace(/\s+/g, ' ')
  }
  return found
}

const lightBlock = css.slice(css.indexOf(':root'), css.indexOf('}'))
const darkMediaBlock = css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/)?.[1] ?? ''
const darkOverrideBlock = css.match(/:root\[data-theme="dark"\] \{([^}]*)\}/)?.[1] ?? ''

const light = tokens(lightBlock)
const darkMedia = tokens(darkMediaBlock)
const darkOverride = tokens(darkOverrideBlock)

/** Every custom property declared anywhere in the file, palette or not. */
const declared = new Set([...css.matchAll(/(--[a-z-]+)\s*:/g)].map((match) => match[1]))

function regionAfter(marker: string, length = 600): string {
  const start = css.indexOf(marker)
  return start === -1 ? '' : css.slice(start, start + length)
}

const OPAQUE_TRIGGERS = [
  '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))',
  '@media (prefers-reduced-transparency: reduce)',
]

describe('the material degrades in three tiers', () => {
  it('tier 1 defines the default material with an edge highlight and a blur', () => {
    const block = css.match(/@utility glass \{([^}]*)\}/)?.[1] ?? ''
    expect(block).not.toBe('')
    expect(block).toContain('backdrop-blur')
    // The fill, rim, and lift come from shared tokens so the material resolves against
    // whichever palette is in force at use time.
    expect(block).toContain('var(--glass-fill)')
    expect(block).toContain('var(--glass-shadow)')
    expect(block).toContain('var(--glass-edge)')
  })

  it('tier 1 tracks the pointer for the specular highlight', () => {
    const region = regionAfter('.glass::before')
    expect(region).not.toBe('')
    expect(region).toContain('var(--glass-x)')
    expect(region).toContain('var(--glass-y)')
  })

  it('tier 2 adds refraction behind a support query, not unconditionally', () => {
    const marker = '@supports (backdrop-filter: url(#liquid-lens))'
    expect(css).toContain(marker)
    expect(regionAfter(marker)).toContain('url(#liquid-lens)')
    // Safari rejects url() inside backdrop-filter, so this must stay gated: an
    // ungated reference would take the blur down with it on that engine.
    expect(css.indexOf(marker)).toBeGreaterThan(css.indexOf('@utility glass'))
  })

  it('tier 2 pairs the CSS with a filter definition that actually exists', () => {
    // The query and the filter live in different files; a rename on either side would
    // silently disable the lens with nothing to catch it.
    expect(shell).toContain('id="liquid-lens"')
    expect(shell).toContain('feDisplacementMap')
    expect(shell).toContain('feImage')
    // Edge-only displacement is the difference between a lens and a smear, so the
    // neutral-centred map must be blurred before it is applied.
    expect(shell).toContain('feGaussianBlur')
  })

  it('approximates continuous curvature only where it is supported', () => {
    expect(css).toContain('@supports (corner-shape: squircle)')
  })

  it('degrades to opaque surfaces where backdrop-filter is unsupported', () => {
    const [supports] = OPAQUE_TRIGGERS
    const region = regionAfter(supports)
    expect(region).toContain('backdrop-filter: none')
    expect(region).toContain('var(--app-surface)')
  })

  it('honours a reduced-transparency preference', () => {
    const region = regionAfter(OPAQUE_TRIGGERS[1])
    expect(region).toContain('backdrop-filter: none')
    expect(region).toContain('var(--app-surface)')
  })

  it('keeps reduced motion handling', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('removes the decorative ambient layer in both opaque fallbacks', () => {
    for (const marker of OPAQUE_TRIGGERS) expect(regionAfter(marker)).toContain('body::before')
  })

  it('suppresses the pointer highlight wherever the material is opaque', () => {
    // A highlight that still tracked the pointer on a surface that fell back to flat
    // would advertise glass that is not being drawn.
    for (const marker of OPAQUE_TRIGGERS) expect(regionAfter(marker)).toContain('.glass::before')
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
    // declared twice; this assertion is what stops the copies drifting.
    expect(darkOverride).toEqual(darkMedia)
  })

  it('keeps the light palette the first root block in the file', () => {
    // theme-contrast.spec.ts slices the light tokens from the first `:root` to the
    // first `}`, so anything declared before it is read as part of the palette.
    expect(css.indexOf(':root')).toBeLessThan(css.indexOf('@theme'))
    expect(css.slice(css.indexOf(':root'), css.indexOf('}'))).toContain('--app-bg')
  })

  it('resolves every custom property the stylesheet references', () => {
    const referenced = new Set([...css.matchAll(/var\((--[a-z-]+)\)/g)].map((match) => match[1]))
    expect(referenced.size).toBeGreaterThan(0)
    for (const token of referenced) expect([...declared]).toContain(token)
  })
})
