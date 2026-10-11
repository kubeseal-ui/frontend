/// <reference types="vite/client" />

// VITE_TELEMETRY_ENDPOINT is the API telemetry endpoint web vitals post
// to (POST, JSON). Unset keeps every call a no-op.
//
// VITE_AVATAR_ENDPOINT is an avatar service the account photo is fetched
// from, keyed by the md5 of the signed-in address. Unset (the default)
// keeps the header on its initials mark and makes no request at all.
interface ImportMetaEnv {
  readonly VITE_TELEMETRY_ENDPOINT?: string
  readonly VITE_AVATAR_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
