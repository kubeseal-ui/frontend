/// <reference types="vite/client" />

// VITE_TELEMETRY_ENDPOINT is the API telemetry endpoint web vitals post
// to (POST, JSON). Unset keeps every call a no-op.
interface ImportMetaEnv {
  readonly VITE_TELEMETRY_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
