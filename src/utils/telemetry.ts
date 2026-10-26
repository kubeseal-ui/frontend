// Web vitals to the API's telemetry endpoint, opt-in via VITE_TELEMETRY_ENDPOINT (default off); nothing here carries an identifier.
import { onCLS, onINP, onFCP, onLCP, onTTFB, type Metric } from 'web-vitals'

const endpoint: string = import.meta.env.VITE_TELEMETRY_ENDPOINT ?? ''

// Batched: a burst of navigation metrics lands in one request instead of five.
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
      // attribution carries element selectors; only the stable part is forwarded.
      navigation_type: metric.navigationType ?? '',
    })),
    path: location.pathname, // a route, not a URL with a query
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

// Registers the web-vitals callbacks once at boot; calling it again would double-register.
export function reportWebVitals(): void {
  if (!endpoint) return
  onCLS(bufferedSend)
  onINP(bufferedSend)
  onFCP(bufferedSend)
  onLCP(bufferedSend)
  onTTFB(bufferedSend)
}
