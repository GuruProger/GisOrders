import { useSyncExternalStore } from 'react'
import { getItem, setItem, STORAGE_KEYS } from '@/shared/lib/storage'

export type RoleMode = 'customer' | 'executor'

export const DEFAULT_ROLE_MODE: RoleMode = 'customer'

function isRoleMode(value: string | null): value is RoleMode {
  return value === 'customer' || value === 'executor'
}

function readStoredMode(): RoleMode {
  const stored = getItem(STORAGE_KEYS.mode)
  return isRoleMode(stored) ? stored : DEFAULT_ROLE_MODE
}

/**
 * Module-level mode shared by every consumer. It is resolved lazily on the
 * first render, so a value written to storage before the app mounts wins.
 */
let currentMode: RoleMode | null = null

const listeners = new Set<() => void>()

function getSnapshot(): RoleMode {
  if (currentMode === null) currentMode = readStoredMode()
  return currentMode
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Switches the UI role without a page reload and persists it for next visits. */
export function setRoleMode(mode: RoleMode): void {
  currentMode = mode
  setItem(STORAGE_KEYS.mode, mode)
  for (const listener of listeners) listener()
}

/**
 * `[mode, setMode]` backed by `localStorage` (`gisorders.mode`). Defaults to
 * the customer view, which is the narrower set of permissions.
 */
export function useRoleMode(): [RoleMode, (mode: RoleMode) => void] {
  const mode = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_ROLE_MODE)
  return [mode, setRoleMode]
}
