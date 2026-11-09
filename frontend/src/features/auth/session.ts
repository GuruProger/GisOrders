import { create } from 'zustand'
import { apiRequest } from '@/api/client'
import { isAuthenticationError } from '@/api/errors'
import { onSessionExpired, refreshSession } from '@/api/refresh'
import { setAccessToken } from '@/api/token'
import type { TokenPair, User } from '@/api/types'
import { clearPendingMessages } from '@/features/chat/pending'
import { getRefreshToken, setRefreshToken } from '@/shared/lib/storage'

export type SessionStatus = 'loading' | 'anonymous' | 'authenticated'

export interface SessionState {
  user: User | null
  status: SessionStatus
  setSession: (pair: TokenPair) => void
  /** Replaces the profile after a successful `PATCH /users/me` (ruling P40). */
  setUser: (user: User) => void
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

  setUser: (user) => {
    set({ user })
  },

  clear: () => {
    setAccessToken(null)
    setRefreshToken(null)
    // Another account must never inherit this session's queued chat drafts.
    // `pending.ts` stays free of session imports, so there is no cycle.
    clearPendingMessages()
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
  } catch (error) {
    if (isAuthenticationError(error)) {
      // Rejected credentials mean there is nothing to restore. Clearing the
      // store also drops the storage entry and the in-memory access token.
      useSession.getState().clear()
      return
    }

    // Offline, timeout or 5xx: keep the refresh token so the session can be
    // recovered. Treat the user as signed in without profile data so guarded
    // routes render instead of redirecting to /login; the next API call will
    // retry the refresh on its 401 path.
    useSession.setState({ user: null, status: 'authenticated' })
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
