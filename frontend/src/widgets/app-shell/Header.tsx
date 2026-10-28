import { Link } from 'react-router'
import { useSession } from '@/features/auth/session'
import { RoleSwitch } from '@/features/switch-role/RoleSwitch'
import { Avatar } from '@/shared/ui/Avatar'

/** Sticky app header: brand, role switch and the current user's avatar. */
export function Header() {
  const user = useSession((state) => state.user)

  return (
    <header
      role="banner"
      className="sticky top-0 z-30 border-b border-line bg-card pt-[env(safe-area-inset-top)]"
    >
      <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center gap-2 px-4">
        <Link
          to="/"
          aria-label="GisOrders — на главную"
          className="flex min-h-11 items-center gap-2 rounded-lg font-semibold text-forest-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
        >
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-full bg-moss-600 text-sm font-bold text-white"
          >
            G
          </span>
          <span className="hidden text-lg sm:inline">GisOrders</span>
        </Link>

        <div className="ml-auto">
          <RoleSwitch />
        </div>

        <Link
          to="/profile"
          aria-label="Открыть профиль"
          className="ml-1 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
        >
          <Avatar name={user?.username} />
        </Link>
      </div>
    </header>
  )
}
