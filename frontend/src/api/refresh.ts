import { getRefreshToken, setRefreshToken } from '@/shared/lib/storage'
import { ApiError, isAuthenticationError, parseError } from './errors'
import { setAccessToken } from './token'
import type { TokenPair } from './types'
import { apiUrl } from './url'

const REFRESH_PATH = '/users/refresh'
const REFRESH_LOCK = 'gisorders-refresh'
const REFRESH_TIMEOUT_MS = 15_000

type LockRequest = <T>(name: string, callback: () => Promise<T>) => Promise<T>

interface LocksLike {
  request: LockRequest
}

const listeners = new Set<() => void>()

let inFlight: Promise<TokenPair> | null = null

export function onSessionExpired(callback: () => void): () => void {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

function emitSessionExpired(): void {
  for (const listener of [...listeners]) {
    try {
      listener()
    } catch {
      // A broken subscriber must not prevent the others from being notified.
    }
  }
}

/** Clears every auth artefact and notifies subscribers that the session is gone. */
export function expireSession(): void {
  setAccessToken(null)
  setRefreshToken(null)
  emitSessionExpired()
}

function getLocks(): LocksLike | null {
  if (typeof navigator === 'undefined') return null
  const locks = (navigator as unknown as { locks?: LocksLike }).locks
  return locks && typeof locks.request === 'function' ? locks : null
}

async function requestTokenPair(refreshToken: string): Promise<TokenPair> {
  const response = await fetch(apiUrl(REFRESH_PATH), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
    signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
  })

  if (!response.ok) throw await parseError(response)

  return (await response.json()) as TokenPair
}

async function performRefresh(): Promise<TokenPair> {
  // Re-read the stored token inside the lock: another tab may have rotated it
  // while we were waiting, and reusing the old value would revoke all sessions.
  const run = async (): Promise<TokenPair> => {
    const stored = getRefreshToken()
    if (!stored) throw new ApiError('Сессия истекла', 401)

    const pair = await requestTokenPair(stored)
    setRefreshToken(pair.refresh_token)
    setAccessToken(pair.access_token)
    return pair
  }

  try {
    const locks = getLocks()
    return locks ? await locks.request(REFRESH_LOCK, run) : await run()
  } catch (error) {
    // Only discard the session when the server says the credentials are bad.
    // Offline, timeout and 5xx failures must keep the tokens so the user can
    // retry once the network or the backend recovers.
    if (isAuthenticationError(error)) expireSession()
    throw error
  }
}

/**
 * Refreshes the token pair at most once per tab at a time, and serialises
 * refreshes across tabs via the Web Locks API when it is available.
 */
export function refreshSession(): Promise<TokenPair> {
  if (!inFlight) {
    inFlight = performRefresh().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

/** True when `path` points at the refresh endpoint itself. */
export function isRefreshPath(path: string): boolean {
  const normalized = path.split('?')[0]?.replace(/\/+$/, '') ?? ''
  return normalized === REFRESH_PATH
}
