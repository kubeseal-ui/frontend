// Contrast floors for the palettes in src/style.css. Text tokens must reach WCAG AA
// (4.5:1); the focus ring is a non-text UI element and must reach 3:1, checked against
// --app-surface and --app-bg only because its offset lands it on whatever the control
// sits on, not on the control's own fill. Read by regex: the stylesheet, not the
// browser, is the artifact under test, so these hold without a rendering engine.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8')

/**
 * The colour declarations in a block. rgb() is captured as well as hex because the
 * glass rim colours carry alpha. Non-colour declarations are deliberately not captured,
 * which is why geometry and durations must stay literals rather than tokens.
 */
function tokens(block: string): Record<string, string> {
  const found: Record<string, string> = {}
  for (const match of block.matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6}|rgba?\([^)]*\))\s*;/gi)) {
    found[match[1]] = match[2].toLowerCase().replace(/\s+/g, ' ')
  }
  return found
}

const lightBlock = css.slice(css.indexOf(':root'), css.indexOf('}'))
const darkBlock = css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/)?.[1] ?? ''
const light = tokens(lightBlock)
const dark = tokens(darkBlock)

/** Every custom property declared anywhere in the file, palette or not. */
const declared = new Set([...css.matchAll(/(--[a-z-]+)\s*:/g)].map((match) => match[1]))

function channel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16))
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function contrast(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

const textPairs = ['--app-ink', '--app-muted', '--app-accent', '--app-danger', '--app-success']
const themes = [
  { name: 'light', values: light },
  { name: 'dark', values: dark },
]

describe('theme token contrast', () => {
  it('declares the same tokens in both themes', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort())
    expect(Object.keys(light)).toContain('--app-focus')
  })

  it('resolves every custom property referenced by the stylesheet', () => {
    // Declared anywhere: --radius-* and --glass-x legitimately live outside the palettes.
    const referenced = new Set([...css.matchAll(/var\((--[a-z-]+)\)/g)].map((match) => match[1]))
    expect(referenced.size).toBeGreaterThan(0)
    for (const token of referenced) expect([...declared]).toContain(token)
  })

  it('exposes every palette token to Tailwind as a utility name', () => {
    // Without the bridge a token can be declared and used via var() while having no
    // bg-*/text-* class at all.
    const bridge = css.match(/@theme inline \{([^}]*)\}/)?.[1] ?? ''
    expect(bridge).not.toBe('')

    const mapped = new Map([...bridge.matchAll(/(--color-[a-z-]+):\s*var\((--[a-z-]+)\)/g)].map((m) => [m[1], m[2]]))
    const palette = Object.keys(light).filter((name) => name.startsWith('--app-'))
    expect(palette.length).toBeGreaterThan(0)

    for (const token of palette) {
      const utility = `--color-${token.slice('--app-'.length)}`
      expect(mapped.get(utility), `${token} has no ${utility} bridge`).toBe(token)
    }
  })

  it('derives the inner radius from the outer radius and the inset', () => {
    const geometry = css.match(/@theme \{([^}]*)\}/)?.[1] ?? ''
    const inner = geometry.match(/--radius-card-inner:\s*([^;]+);/)?.[1].trim() ?? ''
    expect(inner).toBe('calc(var(--radius-card) - var(--glass-inset))')
    expect(geometry).toMatch(/--radius-card:\s*\d+px;/)
    expect(geometry).toMatch(/--glass-inset:\s*\d+px;/)
  })

  for (const theme of themes) {
    it(`keeps text tokens at AA or better in the ${theme.name} theme`, () => {
      // --app-surface-raised is the background most text actually sits on, and partial-alpha
      // surfaces composite between it and --app-surface, so both endpoints are checked.
      for (const token of textPairs) {
        for (const surface of ['--app-surface', '--app-surface-raised', '--app-bg']) {
          const ratio = contrast(theme.values[token], theme.values[surface])
          expect(ratio, `${token} on ${surface} in ${theme.name}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
        }
      }
    })

    it(`keeps the focus indicator at 3:1 or better in the ${theme.name} theme`, () => {
      for (const surface of ['--app-surface', '--app-bg']) {
        const ratio = contrast(theme.values['--app-focus'], theme.values[surface])
        expect(ratio, `focus on ${surface} in ${theme.name}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
      }
    })
  }
})
