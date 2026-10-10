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

// The pairs above hold text against a *solid* token. On a glass surface the text sits on
// --glass-fill composited over the ambient wash composited over --app-bg, and the wash is
// two radial gradients whose peaks sit in opposite corners. So the colour behind a glyph is
// not a token and the worst point in the box has to be found by sampling it.
//
// ADR-004 holds the material decorative, which is what makes this arithmetic the material's
// whole legibility guarantee rather than a restatement of a hierarchy claim: no meaning is
// carried by where the glass sits, so nothing else defends the text on it. Every constant
// below is parsed from style.css; the spec fails if any of them moves far enough.

const surfacePercent = Number(
  css.match(/--glass-fill:\s*color-mix\(in srgb, var\(--app-surface\)\s*([\d.]+)%/)![1],
)

// Painted in CSS order, so the first gradient in the list is the top layer.
const wash = [...(css.match(/body::before\s*\{[^}]*background:\s*([\s\S]*?);/)?.[1] ?? '').matchAll(
  /radial-gradient\(\s*([\d.]+)% ([\d.]+)% at (-?[\d.]+)% (-?[\d.]+)%,\s*color-mix\(in srgb, var\((--app-[a-z-]+)\) ([\d.]+)%, transparent\),\s*transparent ([\d.]+)%\)/g,
)].map(([, rx, ry, cx, cy, token, alpha, fade]) => ({
  rx: Number(rx) / 100,
  ry: Number(ry) / 100,
  cx: Number(cx) / 100,
  cy: Number(cy) / 100,
  token,
  alpha: Number(alpha) / 100,
  fade: Number(fade) / 100,
}))

// body::before overscans by -4% on every side, and the drift animation translates and
// scales it about its centre; both extremes are sampled because the layer's centre is the
// viewport's, so the tint on screen differs between them.
const overscan = 1.08
const drift = [...css.matchAll(/(?:from|to) \{ transform: translate3d\((-?[\d.]+)%, (-?[\d.]+)%, 0\) scale\(([\d.]+)\); \}/g)]
  .map(([, x, y, s]) => ({ tx: Number(x) / 100, ty: Number(y) / 100, s: Number(s) }))

type Rgb = [number, number, number]

const parsed = new Map<string, Rgb>()
function rgb(hex: string): Rgb {
  const cached = parsed.get(hex)
  if (cached) return cached
  const value: Rgb = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
  parsed.set(hex, value)
  return value
}

/** The rim colours carry alpha, so they are `rgb(r g b / a)` rather than hex. */
function rgba(value: string): { colour: Rgb; alpha: number } {
  const [r, g, b, a] = value.match(/[\d.]+/g)!.map(Number)
  return { colour: [r, g, b], alpha: a ?? 1 }
}

const over = (top: Rgb, alpha: number, bottom: Rgb): Rgb => [
  alpha * top[0] + (1 - alpha) * bottom[0],
  alpha * top[1] + (1 - alpha) * bottom[1],
  alpha * top[2] + (1 - alpha) * bottom[2],
]

const luminanceOf = ([r, g, b]: Rgb) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

function materialRatio(foreground: Rgb, background: Rgb): number {
  const [lighter, darker] = [luminanceOf(foreground), luminanceOf(background)].sort((a, b) => b - a)
  return (lighter + 0.05) / (darker + 0.05)
}

/** The wash over the page background at one point of the viewport, in viewport fractions. */
function backdropAt(values: Record<string, string>, x: number, y: number, moved: { tx: number; ty: number; s: number }): Rgb {
  let backdrop = rgb(values['--app-bg'])
  for (const gradient of [...wash].reverse()) {
    // Undo the drift about the layer's centre to reach the gradient's own coordinates.
    const fx = 0.5 + (x - 0.5 - moved.tx * overscan) / (moved.s * overscan)
    const fy = 0.5 + (y - 0.5 - moved.ty * overscan) / (moved.s * overscan)
    const t = Math.hypot((fx - gradient.cx) / gradient.rx, (fy - gradient.cy) / gradient.ry)
    const alpha = gradient.alpha * Math.min(1, Math.max(0, 1 - t / gradient.fade))
    if (alpha > 0) backdrop = over(rgb(values[gradient.token]), alpha, backdrop)
  }
  return backdrop
}

const STEPS = 32

/** The worst text contrast anywhere on the material: the strongest tint under the fill,
 *  with the pointer highlight at its centre — the two extremes that can meet one glyph. */
function worstOnGlass(values: Record<string, string>, foreground: string): number {
  const surface = rgb(values['--app-surface'])
  const specular = rgba(values['--glass-specular'])
  let worst = Infinity
  for (let step = 0; step <= 4; step++) {
    const at = step / 4
    const moved = {
      tx: drift[0].tx + (drift[1].tx - drift[0].tx) * at,
      ty: drift[0].ty + (drift[1].ty - drift[0].ty) * at,
      s: drift[0].s + (drift[1].s - drift[0].s) * at,
    }
    for (let i = 0; i <= STEPS; i++) {
      for (let j = 0; j <= STEPS; j++) {
        const glass = over(surface, surfacePercent / 100, backdropAt(values, i / STEPS, j / STEPS, moved))
        const lit = over(specular.colour, specular.alpha, glass)
        worst = Math.min(worst, materialRatio(rgb(foreground), lit))
      }
    }
  }
  return worst
}

describe('glass material contrast', () => {
  it('reads the wash and the fill out of the stylesheet', () => {
    // A regex that stops matching would leave the checks below comparing nothing.
    expect(wash).toHaveLength(2)
    expect(surfacePercent).toBeGreaterThan(0)
    expect(drift).toHaveLength(2)
  })

  for (const theme of themes) {
    it(`keeps text on the glass composite at AA or better in the ${theme.name} theme`, () => {
      for (const token of textPairs) {
        const worst = worstOnGlass(theme.values, theme.values[token])
        expect(worst, `${token} on the ${theme.name} glass composite: ${worst.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
      }
    })
  }
})
