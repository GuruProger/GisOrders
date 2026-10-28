import { create } from 'zustand'
import { apiRequest } from '@/api/client'
import { onSessionExpired, refreshSession } from '@/api/refresh'
import { setAccessToken } from '@/api/token'
import type { TokenPair, User } from '@/api/types'
import { getRefreshToken, setRefreshToken } from '@/shared/lib/storage'

export type SessionStatus = 'loading' | 'anonymous' | 'authenticated'

export interface SessionState {
  user: User | null
  status: SessionStatus
  setSession: (pair: TokenPair) => void
  clear: () => void
}

/**
 * Session state shared by the router guards and the auth forms. The access
 * token itself lives in the api module; the refresh token lives in storage.
 */
export const useSession = create<SessionState>((set) => ({
  user: null,
  status: 'loading',

  setSession: (pair) => {
    setAccessToken(pair.access_token)
    setRefreshToken(pair.refresh_token)
    set({ user: pair.user, status: 'authenticated' })
  },

  clear: () => {
    setAccessToken(null)
    setRefreshToken(null)
    set({ user: null, status: 'anonymous' })
  },
}))

let bootstrapPromise: Promise<void> | null = null

async function restoreSession(): Promise<void> {
  if (!getRefreshToken()) {
    useSession.getState().clear()
    return
  }

  try {
    await refreshSession()
    const { data } = await apiRequest<User>('/users/me')
    useSession.setState({ user: data, status: 'authenticated' })
  } catch {
    // A rejected refresh token means there is nothing to restore. Clearing the
    // store also drops the storage entry and the in-memory access token.
    useSession.getState().clear()
  }
}

/**
 * Restores the session once per page load. Idempotent so React StrictMode's
 * double effect invocation does not trigger a second refresh.
 */
export function bootstrap(): Promise<void> {
  if (!bootstrapPromise) bootstrapPromise = restoreSession()
  return bootstrapPromise
}

onSessionExpired(() => {
  useSession.getState().clear()
})
