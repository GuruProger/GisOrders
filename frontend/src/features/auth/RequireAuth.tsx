import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { useSession } from './session'

export interface RequireAuthProps {
  children?: ReactNode
}

/**
 * Guards the authenticated part of the app. While the session is being
 * restored it renders a skeleton instead of redirecting, so a page reload with
 * a valid refresh token does not bounce the user through `/login`.
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const status = useSession((state) => state.status)
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div
        role="status"
        aria-label="Загрузка сессии"
        className="flex min-h-dvh items-center justify-center bg-surface"
      >
        <span
          aria-hidden="true"
          className="size-8 animate-spin rounded-full border-2 border-moss-600 border-t-transparent"
        />
        <span className="sr-only">Загрузка…</span>
      </div>
    )
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <>{children ?? <Outlet />}</>
}
