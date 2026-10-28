import { useSyncExternalStore } from 'react'
import { NavLink, Outlet } from 'react-router'
import { useRoleMode, type RoleMode } from '@/features/switch-role/model'
import { cn } from '@/shared/lib/cn'
import { BottomNav } from './BottomNav'
import { Header } from './Header'
import { NavIcon } from './NavIcon'
import { navItems } from './nav-items'

const DESKTOP_QUERY = '(min-width: 1024px)'

/**
 * `matchMedia` is missing in jsdom, so detection falls back to the narrow
 * layout. That keeps component tests deterministic and matches mobile-first.
 */
function subscribeToViewport(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(DESKTOP_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function getIsDesktop(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(DESKTOP_QUERY).matches
}

function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribeToViewport, getIsDesktop, () => false)
}

const tabClasses = ({ isActive }: { isActive: boolean }): string =>
  cn(
    'inline-flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-leaf-500',
    isActive
      ? 'border-moss-600 text-moss-600'
      : 'border-transparent text-muted hover:text-moss-600',
  )

/** Inline tab row shown from 1024 px upwards. */
function DesktopNav({ mode }: { mode: RoleMode }) {
  return (
    <nav
      role="navigation"
      aria-label="Основная навигация"
      className="border-b border-line bg-card"
    >
      <ul className="mx-auto flex w-full max-w-6xl gap-1 px-4">
        {navItems(mode).map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.to === '/'} className={tabClasses}>
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/**
 * Authenticated application frame: header, exactly one navigation variant and
 * the routed page. The mobile variant is fixed to the bottom, so the content
 * keeps 64 px + the safe-area inset of clearance.
 */
export function AppShell() {
  const [mode] = useRoleMode()
  const isDesktop = useIsDesktop()

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <Header />

      {isDesktop ? <DesktopNav mode={mode} /> : null}

      <main
        className={cn(
          'mx-auto w-full max-w-6xl flex-1 px-4 pt-6',
          isDesktop ? 'pb-10' : 'pb-[calc(4rem+env(safe-area-inset-bottom))]',
        )}
      >
        <Outlet />
      </main>

      {isDesktop ? null : <BottomNav mode={mode} />}
    </div>
  )
}
