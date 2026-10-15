// Guards for the token layer's invariants. These assert the rules exist, not that a
// browser rendered them; what a test can catch is a palette losing a token, the two
// copies of the dark palette drifting, or a custom property referenced through var()
// that nothing declares.
//
// This file was glass-fallbacks.spec.ts and guarded the three-tier material — the blur,
// the pointer highlight, the opaque fallbacks, the SVG lens. The redesign removed the
// material outright (it carried no meaning, so there is nothing left to fall back to),
// and those assertions went with it. What survives is the palette contract they shared a
// file with.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8')
const favicon = readFileSync(resolve(process.cwd(), 'public/favicon.svg'), 'utf8')

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

describe('the token layer', () => {
  it('keeps reduced motion handling', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('honours an in-app motion switch as well as the system preference', () => {
    // The media query cannot be asked for by a person who wants the reduction on one
    // machine only, so the attribute form is not redundant with it.
    expect(css).toContain('html[data-motion="reduced"]')
  })

  it('never lets an animation outlive a reduced-motion request', () => {
    // A spinner left at animation-iteration-count: infinite turns a reduction into a
    // thousand rotations a second, which is worse than the animation it replaced.
    const reduced = css.slice(css.indexOf('html[data-motion="reduced"]'))
    expect(reduced).toContain('animation-iteration-count: 1')
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

describe('the favicon mark', () => {
  // The mark is a third copy of the accent pair. It cannot reference the tokens — a favicon is
  // its own document, rendered against the browser chrome rather than the page — so the copies
  // are literal and this file is what stops them drifting.
  const markLight = tokens(favicon.slice(0, favicon.indexOf('@media')))
  const markDark = tokens(
    favicon.match(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/)?.[1] ?? '',
  )

  it('stays well-formed XML: an XML comment may not contain a double hyphen', () => {
    // The mark is served as image/svg+xml, which the browser parses as strict XML. A stray `--`
    // in a comment — the obvious way to name a custom property in prose — voids the whole
    // document, and the failure is silent: the tab simply shows no icon.
    const comments = [...favicon.matchAll(/<!--([\s\S]*?)-->/g)].map((match) => match[1])
    expect(comments.length).toBeGreaterThan(0)
    for (const body of comments) expect(body).not.toContain('--')
  })

  it('keeps the mark on the light accent pair', () => {
    expect(markLight).toEqual({ '--mark-bg': light['--app-accent'], '--mark-fg': light['--app-accent-ink'] })
  })

  it('keeps the mark on the dark accent pair', () => {
    expect(markDark).toEqual({ '--mark-bg': darkMedia['--app-accent'], '--mark-fg': darkMedia['--app-accent-ink'] })
  })
})
