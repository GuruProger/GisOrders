import type { RoleMode } from '@/features/switch-role/model'

export type NavIconName = 'list' | 'briefcase' | 'send' | 'chat' | 'user'

export interface NavItem {
  to: string
  label: string
  icon: NavIconName
}

/**
 * The five primary destinations. Executors see the same routes with wording
 * that matches their side of the marketplace.
 */
export function navItems(mode: RoleMode): NavItem[] {
  const isExecutor = mode === 'executor'

  return [
    { to: '/', label: 'Лента', icon: 'list' },
    { to: '/my/orders', label: isExecutor ? 'Мои работы' : 'Мои заказы', icon: 'briefcase' },
    { to: '/my/proposals', label: isExecutor ? 'Мои отклики' : 'Отклики', icon: 'send' },
    { to: '/chats', label: 'Чаты', icon: 'chat' },
    { to: '/profile', label: 'Профиль', icon: 'user' },
  ]
}
