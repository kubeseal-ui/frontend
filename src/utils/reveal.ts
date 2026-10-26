import { nextTick } from 'vue'

// Carries the viewport to what a press just produced; dropped under reduced motion, and a region already in view is left where it is.
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
    // tabindex -1 lets focus land on it without adding it to the tab order.
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
    el.focus({ preventScroll: true })
  }
}
