import { NavLink } from 'react-router'
import type { RoleMode } from '@/features/switch-role/model'
import { cn } from '@/shared/lib/cn'
import { UnreadBadge } from '@/shared/ui/UnreadBadge'
import { NavIcon } from './NavIcon'
import { navItems } from './nav-items'

export interface BottomNavProps {
  mode: RoleMode
  /** Unread messages total; only the chat item renders it. */
  unreadCount?: number
}

const linkClasses = ({ isActive }: { isActive: boolean }): string =>
  cn(
    'flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-leaf-500',
    isActive ? 'text-moss-600' : 'text-muted-strong hover:text-moss-600',
  )

/** Fixed bottom navigation shown below the 1024 px breakpoint. */
export function BottomNav({ mode, unreadCount = 0 }: BottomNavProps) {
  return (
    <nav
      role="navigation"
      aria-label="Основная навигация"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-6xl grid-cols-5">
        {navItems(mode).map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.to === '/'} className={linkClasses}>
              <NavIcon name={item.icon} />
              <span>{item.label}</span>
              {item.to === '/chats' ? <UnreadBadge count={unreadCount} /> : null}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
