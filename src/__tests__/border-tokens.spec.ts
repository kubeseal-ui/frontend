// A border utility that names only a width draws the element's own text colour: Tailwind's preflight
// sets `border: 0 solid` and no colour, so the CSS default `currentColor` applies. On the dark theme
// that is a white rule through the middle of content — which is what the namespace page's ledger
// shipped, because its row named `border-b border-l-2` and nothing else.
//
// This checks static `class` attributes, which is where a separator's own colour is written. The
// colour may be overridden per state from a `:class` binding beside it (a tile that sicks, the
// gutter a drifted row carries), so only the presence of a colour is asserted, not which one wins.
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(process.cwd(), 'src')

/** A directional width, with or without a number, plus the arbitrary-value form. `border` alone is
 *  left out on purpose: a full frame takes its colour from the class binding of a control's states. */
const WIDTH = /^border-[trblxy](-(\d+|\[[^\]]+\]))?$/
/** `border-<colour>` or `border-<side>-<colour>`, alpha suffix included. */
const COLOUR = /^border(-[trblxy])?-(?!\d)(?!\[)[a-z][a-z0-9-]*(\/\d+)?$/
/** Border *styles*, which that pattern would otherwise read as a colour name. */
const STYLES = new Set(['solid', 'dashed', 'dotted', 'double', 'none', 'hidden'])

function templates(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(dir, entry.name)
    if (entry.isDirectory()) return templates(path)
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

/** Static `class="..."` attributes. A `:class` binding never matches, since `:` is not whitespace. */
function classAttributes(source: string): string[] {
  return [...source.matchAll(/\sclass="([^"]*)"/g)].map((match) => match[1])
}

describe('border utilities', () => {
  it('names a colour on every border a component draws', () => {
    const offenders: string[] = []
    for (const file of templates(SRC)) {
      for (const classes of classAttributes(readFileSync(file, 'utf8'))) {
        // A variant prefix states when the utility applies, not what it draws.
        const tokens = classes.split(/\s+/).filter(Boolean).map((token) => token.slice(token.lastIndexOf(':') + 1))
        if (!tokens.some((token) => WIDTH.test(token))) continue
        const named = tokens.some(
          (token) => COLOUR.test(token) && !STYLES.has(token.replace(/^border(-[trblxy])?-/, '')),
        )
        if (!named) offenders.push(`${file.slice(SRC.length + 1)}: ${classes}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
