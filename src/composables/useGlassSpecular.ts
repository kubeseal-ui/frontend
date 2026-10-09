import { onScopeDispose } from 'vue'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
const REDUCED_TRANSPARENCY = '(prefers-reduced-transparency: reduce)'

// globalThis, not window, so a test can replace the lookup.
function mediaQuery(query: string): MediaQueryList | null {
  const match = globalThis.matchMedia
  if (typeof match !== 'function') return null
  try {
    return match.call(globalThis, query)
  } catch {
    return null
  }
}

// The highlight is a position *within* a surface, so `--glass-x`/`--glass-y` are written
// on the element under the pointer, never on the document. It stands down under reduced
// motion or transparency: with the material undrawn, a tracking highlight would advertise
// glass that is not there.
export function useGlassSpecular(): void {
  if (typeof document === 'undefined' || !document.documentElement) return

  const motion = mediaQuery(REDUCED_MOTION)
  const transparency = mediaQuery(REDUCED_TRANSPARENCY)
  const suppressed = () => Boolean(motion?.matches || transparency?.matches)

  let frame = 0
  let target: HTMLElement | null = null
  let x = 50
  let y = 0

  // Coalesce per frame where the environment can schedule one; elsewhere write
  // immediately, which is one style property on one element.
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
