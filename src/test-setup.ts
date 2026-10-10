/**
 * Test-environment shim for Web Storage.
 *
 * Node 22+ defines `globalThis.localStorage` as a lazy accessor that returns undefined
 * without `--localstorage-file`. That global already exists by the time happy-dom
 * populates globals, so happy-dom's own Storage never lands and `window` — which is
 * `globalThis` under happy-dom — ends up with no working `localStorage`; specs then
 * throw in `beforeEach` before a single assertion runs.
 *
 * The application is unaffected: `stores/ui.ts` reads through `globalThis.localStorage?.`
 * and falls back to in-memory defaults, which is what private-mode browsers need. That
 * guard is also why the specs must supply real storage — a fallback would let them pass
 * for the wrong reason. Installed only where the environment did not already provide a
 * usable one.
 */
function createMemoryStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    key: (index: number) => Array.from(entries.keys())[index] ?? null,
    getItem: (key: string) => entries.get(String(key)) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(String(key), String(value))
    },
    removeItem: (key: string) => {
      entries.delete(String(key))
    },
    clear: () => {
      entries.clear()
    },
  } as unknown as Storage
}

function isWorkingStorage(value: unknown): value is Storage {
  return typeof value === 'object' && value !== null && typeof (value as Storage).getItem === 'function'
}

function installLocalStorage(): void {
  if (isWorkingStorage(globalThis.localStorage)) return

  const storage = createMemoryStorage()
  const targets: object[] = [globalThis]
  if (typeof window !== 'undefined') targets.push(window)

  for (const target of targets) {
    try {
      Object.defineProperty(target, 'localStorage', { value: storage, configurable: true, writable: true })
    } catch {
      // A non-configurable global cannot be replaced from here.
    }
  }

  if (!isWorkingStorage(globalThis.localStorage)) {
    console.warn(
      '[test-setup] localStorage is still unavailable. Re-run with ' +
        'NODE_OPTIONS=--no-experimental-webstorage, which removes the Node global that ' +
        'shadows the test environment.',
    )
  }
}

installLocalStorage()
