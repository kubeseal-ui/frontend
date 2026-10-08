import { onScopeDispose } from 'vue'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const REDUCED_TRANSPARENCY = '(prefers-reduced-transparency: reduce)'

/**
 * Reads through globalThis rather than window so the lookup is the same one a
 * test can replace, and so a non-browser caller gets null instead of throwing.
 */
function mediaQuery(query: string): MediaQueryList | null {
  const match = globalThis.matchMedia
  if (typeof match !== 'function') return null
  try {
    return match.call(globalThis, query)
  } catch {
    return null
  }
}

/**
 * Moves the specular highlight of each glass surface to the pointer.
 *
 * It writes `--glass-x` / `--glass-y` onto the surface the pointer is over, not
 * onto the document, because the highlight is a position *within* a surface:
 * one shared page coordinate would park every card's highlight in the same
 * relative spot no matter where the pointer crossed it. Only the element under
 * the pointer is written, and only once per frame.
 *
 * The highlight is decoration on top of decoration, so it stands down entirely
 * when the user has asked for less motion or less transparency — in the latter
 * case the material is not being drawn at all, and a highlight that still
 * tracked the pointer would advertise glass that is not there. No-ops where
 * there is no document, which is what keeps it harmless under test.
 */
export function useGlassSpecular(): void {
  if (typeof document === 'undefined' || !document.documentElement) return

  const motion = mediaQuery(REDUCED_MOTION)
  const transparency = mediaQuery(REDUCED_TRANSPARENCY)
  const suppressed = () => Boolean(motion?.matches || transparency?.matches)

  let frame = 0
  let target: HTMLElement | null = null
  let x = 50
  let y = 0

  // A frame's worth of coalescing where the environment can schedule one, and
  // an immediate write where it cannot — the write is one style property on one
  // element, so doing it synchronously is cheap rather than a correctness risk.
  const canSchedule = typeof globalThis.requestAnimationFrame === 'function'

  function paint() {
    frame = 0
    if (!target) return
    target.style.setProperty('--glass-x', `${x.toFixed(2)}%`)
    target.style.setProperty('--glass-y', `${y.toFixed(2)}%`)
  }

  function schedule() {
    if (!canSchedule) {
      paint()
      return
    }
    if (frame === 0) frame = globalThis.requestAnimationFrame(paint)
  }

  function onPointerMove(event: PointerEvent) {
    if (suppressed()) return
    const source = event.target
    if (!source || typeof (source as Element).closest !== 'function') return

    const surface = (source as Element).closest('.glass') as HTMLElement | null
    if (!surface) return

    const rect = surface.getBoundingClientRect()
    // A surface with no box (not laid out, or a test environment with no
    // renderer) has no meaningful position to report.
    if (rect.width === 0 || rect.height === 0) return

    target = surface
    x = ((event.clientX - rect.left) / rect.width) * 100
    y = ((event.clientY - rect.top) / rect.height) * 100
    schedule()
  }

  function onPreferenceChange() {
    if (!suppressed()) return
    if (frame !== 0) {
      globalThis.cancelAnimationFrame(frame)
      frame = 0
    }
    target?.style.removeProperty('--glass-x')
    target?.style.removeProperty('--glass-y')
    target = null
  }

  document.addEventListener('pointermove', onPointerMove, { passive: true })
  motion?.addEventListener?.('change', onPreferenceChange)
  transparency?.addEventListener?.('change', onPreferenceChange)

  onScopeDispose(() => {
    document.removeEventListener('pointermove', onPointerMove)
    motion?.removeEventListener?.('change', onPreferenceChange)
    transparency?.removeEventListener?.('change', onPreferenceChange)
    if (frame !== 0) globalThis.cancelAnimationFrame(frame)
  })
}
