import type { QueryClient } from '@tanstack/react-query'
import { useSession } from './session'

/**
 * Drops every cached query when the session ends (explicit sign-out or an
 * expired refresh token). Without this, a second account on the same browser
 * would render the previous account's orders, chats and proposals from cache.
 *
 * Lives in its own module so `session.ts` stays free of QueryClient imports.
 * Returns the unsubscribe handle for the React effect that owns it.
 */
export function attachSessionCacheReset(queryClient: QueryClient): () => void {
  return useSession.subscribe((state, previousState) => {
    if (previousState.status === 'authenticated' && state.status === 'anonymous') {
      queryClient.clear()
    }
  })
}
