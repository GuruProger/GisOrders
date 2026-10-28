import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TestProviders } from '@/test/providers'
import { AppShell } from './AppShell'

afterEach(() => {
  localStorage.clear()
})

test('role switch changes nav labels and persists mode', async () => {
  localStorage.clear()
  render(<AppShell />, { wrapper: TestProviders })
  expect(screen.getByRole('link', { name: 'Мои заказы' })).toBeInTheDocument()

  await userEvent.click(screen.getByRole('radio', { name: 'Исполнитель' }))

  expect(screen.getAllByRole('link', { name: 'Мои работы' }).length).toBeGreaterThan(0)
  expect(localStorage.getItem('gisorders.mode')).toBe('executor')
})

test('header and bottom nav are both present in DOM', () => {
  render(<AppShell />, { wrapper: TestProviders })
  expect(screen.getByRole('banner')).toBeInTheDocument()
  expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toBeInTheDocument()
})

test('renders only one navigation variant and links to the profile', () => {
  render(<AppShell />, { wrapper: TestProviders })

  expect(screen.getAllByRole('navigation', { name: 'Основная навигация' })).toHaveLength(1)
  expect(screen.getByRole('link', { name: 'Открыть профиль' })).toHaveAttribute('href', '/profile')
  expect(screen.getByRole('link', { name: 'GisOrders — на главную' })).toHaveAttribute('href', '/')
})
