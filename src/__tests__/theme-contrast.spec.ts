// Theme token contrast checks for the light and dark palettes declared in src/style.css.
// Text tokens must reach WCAG AA (4.5:1); the focus indicator is a non-text UI element
// and must reach 3:1 against both --color-surface and --color-bg (WCAG 1.4.11 / 2.4.11).
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
const darkBlock = css.match(/@media \(prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/)?.[1] ?? ''
const light = tokens(lightBlock)
const dark = tokens(darkBlock)

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

const textPairs = ['color-ink', 'color-muted', 'color-accent', 'color-danger', 'color-success']
const themes = [
  { name: 'light', values: light },
  { name: 'dark', values: dark },
]

describe('theme token contrast', () => {
  it('declares the same tokens in both themes', () => {
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort())
    expect(Object.keys(light)).toContain('--color-focus')
  })

  it('resolves every token referenced by the stylesheet', () => {
    const referenced = new Set([...css.matchAll(/var\((--[a-z-]+)\)/g)].map((match) => match[1]))
    expect(referenced.size).toBeGreaterThan(0)
    for (const token of referenced) expect(Object.keys(light)).toContain(token)
  })

  for (const theme of themes) {
    it(`keeps text tokens at AA or better in the ${theme.name} theme`, () => {
      for (const token of textPairs) {
        for (const surface of ['--color-surface', '--color-bg']) {
          const ratio = contrast(theme.values[`--${token}`], theme.values[surface])
          expect(ratio, `${token} on ${surface} in ${theme.name}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
        }
      }
    })

    it(`keeps the focus indicator at 3:1 or better in the ${theme.name} theme`, () => {
      for (const surface of ['--color-surface', '--color-bg']) {
        const ratio = contrast(theme.values['--color-focus'], theme.values[surface])
        expect(ratio, `focus on ${surface} in ${theme.name}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
      }
    })
  }
})
