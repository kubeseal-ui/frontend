import { nextTick } from 'vue'

// Each stage of the workflow appends its result below the last, so on a tall page the thing the
// press just produced — a fresh diff to review, a landed confirmation — opens below the fold. This
// carries the viewport to it on the transition, so the operator is drawn to the next task rather
// than left scrolling to find it. Motion is dropped under a reduced-motion request, and a region
// already in view is left where it is rather than nudged.
export async function revealRegion(
  target: () => HTMLElement | null | undefined,
  options: { focus?: boolean } = {},
): Promise<void> {
  await nextTick()
  const el = target()
  if (!el) return
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' })
  if (options.focus) {
    // A status region is not focusable on its own; a tabindex of -1 lets focus land on it without
    // adding it to the tab order, so a keyboard user is placed on the result they just produced.
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
    el.focus({ preventScroll: true })
  }
}
