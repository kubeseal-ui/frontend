// Where the operator was before an auth redirect, remembered across the round trip to the OIDC
// provider so login returns them there instead of to the app root. sessionStorage is the right
// store: it survives navigating away to the provider and back within the same tab, and does not
// leak the path to other tabs or outlive the session the way localStorage would.

const KEY = 'kubeseal_return_to'

// A same-origin, absolute path only. Anything that could steer the browser to another origin — a
// full URL, or a protocol-relative `//host` — is refused, so a tampered value cannot turn login
// into an open redirect.
function isLocalPath(path: string | null): path is string {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//')
}

/** Remember the path to return to after login. Wrapped because a private window can make
 *  sessionStorage throw; a failure just means login lands on the app root. */
export function rememberReturnPath(path: string): void {
  if (!isLocalPath(path)) return
  try {
    window.sessionStorage.setItem(KEY, path)
  } catch {
    // storage unavailable — degrade to returning to the root
  }
}

/** Read and clear the remembered path. Consume-once: it is written only right before an auth
 *  redirect, so the first boot after the callback is the only one meant to act on it. Returns null
 *  when there is nothing to restore or the stored value is not a safe local path. */
export function consumeReturnPath(): string | null {
  let path: string | null = null
  try {
    path = window.sessionStorage.getItem(KEY)
    window.sessionStorage.removeItem(KEY)
  } catch {
    return null
  }
  return isLocalPath(path) ? path : null
}
