import { act, renderHook } from '@testing-library/react'
import { navItems } from '@/widgets/app-shell/nav-items'
import { useRoleMode } from './model'

afterEach(() => {
  localStorage.clear()
})

test('executor nav renames orders and proposals', () => {
  expect(navItems('executor').map((item) => item.label)).toEqual([
    'Лента',
    'Мои работы',
    'Мои отклики',
    'Чаты',
    'Профиль',
  ])
})

test('customer nav keeps orders and proposals wording', () => {
  expect(navItems('customer').map((item) => item.label)).toEqual([
    'Лента',
    'Мои заказы',
    'Отклики',
    'Чаты',
    'Профиль',
  ])
})

test('nav items point at the five primary routes', () => {
  expect(navItems('customer').map((item) => item.to)).toEqual([
    '/',
    '/my/orders',
    '/my/proposals',
    '/chats',
    '/profile',
  ])
})

test('role mode defaults to customer and persists changes', () => {
  localStorage.clear()
  const { result } = renderHook(() => useRoleMode())

  expect(result.current[0]).toBe('customer')

  act(() => result.current[1]('executor'))

  expect(result.current[0]).toBe('executor')
  expect(localStorage.getItem('gisorders.mode')).toBe('executor')
})
