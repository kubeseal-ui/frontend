// Where the operator was before an auth redirect, remembered across the OIDC round trip; sessionStorage so it survives the provider and back but not other tabs.

const KEY = 'kubeseal_return_to'

// Same-origin absolute path only, so a tampered value cannot turn login into an open redirect.
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

/** Consume-once: written only right before an auth redirect, so the first boot after the callback is the only one meant to act on it. */
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
