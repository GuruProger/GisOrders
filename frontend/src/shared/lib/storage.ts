/**
 * Storage keys used by the client. Refresh token lives in localStorage; the
 * access token never does (see `@/api/token`).
 */
export const STORAGE_KEYS = {
  refresh: 'gisorders.refresh',
  mode: 'gisorders.mode',
  point: 'gisorders.point',
  draft: 'gisorders.draft',
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

/**
 * `localStorage` is unavailable in some environments (private mode, disabled
 * storage, sandboxed iframes). In that case we fall back to an in-memory map
 * so the app keeps working for the lifetime of the page.
 */
const memory = new Map<string, string>()

interface ReadResult {
  available: boolean
  value: string | null
}

function readFromLocalStorage(key: string): ReadResult {
  try {
    return { available: true, value: window.localStorage.getItem(key) }
  } catch {
    return { available: false, value: null }
  }
}

function writeToLocalStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Private mode: the value stays in memory only.
  }
}

function removeFromLocalStorage(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Private mode: nothing to remove.
  }
}

export function getItem(key: StorageKey): string | null {
  const stored = readFromLocalStorage(key)
  if (stored.available) return stored.value
  return memory.get(key) ?? null
}

export function setItem(key: StorageKey, value: string): void {
  memory.set(key, value)
  writeToLocalStorage(key, value)
}

export function removeItem(key: StorageKey): void {
  memory.delete(key)
  removeFromLocalStorage(key)
}

export function getJson<T>(key: StorageKey): T | null {
  const raw = getItem(key)
  if (raw === null) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function setJson(key: StorageKey, value: unknown): void {
  setItem(key, JSON.stringify(value))
}

export function getRefreshToken(): string | null {
  return getItem(STORAGE_KEYS.refresh)
}

export function setRefreshToken(token: string | null): void {
  if (token === null) {
    removeItem(STORAGE_KEYS.refresh)
    return
  }
  setItem(STORAGE_KEYS.refresh, token)
}
