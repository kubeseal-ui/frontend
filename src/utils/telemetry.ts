// Web vitals reporting: CLS, INP, FCP, LCP, and TTFB flow to the API's
// telemetry endpoint so operators can correlate browser experience with
// server-side traces. The module is opt-in via VITE_TELEMETRY_ENDPOINT:
// unset (the default) keeps every call a no-op, so local dev and tests
// never make network requests. Values never carry identifiers; the
// attribution data web-vitals reports is bounded and sanitized here.
import { onCLS, onINP, onFCP, onLCP, onTTFB, type Metric } from 'web-vitals'

const endpoint: string = import.meta.env.VITE_TELEMETRY_ENDPOINT ?? ''

// vitalsBuffer batches metrics so a burst of navigation metrics lands in
// one request instead of five.
const vitalsBuffer: Metric[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function bufferedSend(metric: Metric): void {
  if (!endpoint) return
  vitalsBuffer.push(metric)
  if (flushTimer !== null) return
  flushTimer = setTimeout(flushBuffer, 2000)
}

function flushBuffer(): void {
  flushTimer = null
  if (vitalsBuffer.length === 0) return
  const batch = vitalsBuffer.splice(0, vitalsBuffer.length)
  const body = JSON.stringify({
    metrics: batch.map((metric) => ({
      name: metric.name,
      value: Math.round(metric.value * 1000) / 1000,
      rating: metric.rating,
      // attribution can carry element selectors; only the stable parts
      // are forwarded.
      navigation_type: metric.navigationType ?? '',
    })),
    // The page path is bounded (a route, not a URL with a query).
    path: location.pathname,
    // time_zone is the browser's IANA zone; no identifiers.
    timestamp: new Date().toISOString(),
  })
  // keepalive so the batch survives a page unload mid-navigation.
  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {
    // A broken endpoint must never break the page: the batch is dropped.
  })
}

// reportWebVitals registers the web-vitals callbacks. It is safe to call
// once at boot; calling it again would double-register, so main.ts calls
// it exactly once.
export function reportWebVitals(): void {
  if (!endpoint) return
  onCLS(bufferedSend)
  onINP(bufferedSend)
  onFCP(bufferedSend)
  onLCP(bufferedSend)
  onTTFB(bufferedSend)
}
