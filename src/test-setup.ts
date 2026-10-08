/**
 * Test-environment shim for Web Storage.
 *
 * Node 22+ defines `globalThis.localStorage` as a lazy accessor: without
 * `--localstorage-file` it returns undefined and prints an ExperimentalWarning.
 * That global therefore already exists by the time Vitest's happy-dom
 * environment populates globals, happy-dom's own Storage never lands, and
 * `window` — which is `globalThis` under happy-dom — ends up with no working
 * `localStorage`. Specs then throw in `beforeEach` on `window.localStorage.clear()`
 * before a single assertion runs.
 *
 * The application is unaffected: `stores/ui.ts` reads through
 * `globalThis.localStorage?.getItem` and degrades to in-memory defaults, which
 * is the behaviour private-mode browsers need. That guard is also why these
 * specs must supply real storage — they verify persistence, so the fallback
 * would let them pass for the wrong reason.
 *
 * Storage is installed only where the environment did not already provide a
 * usable one, so a happy-dom that stops being shadowed still takes precedence.
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

/** A value is usable only if it is an object exposing the Storage methods. */
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
