import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { User } from '@/api/types'
import { useSession } from '@/features/auth/session'
import { server } from '@/test/msw'
import { TestProviders } from '@/test/providers'
import { AppShell } from './AppShell'

const user: User = {
  id: 2,
  email: 'customer@example.com',
  username: 'customer',
  phone_number: null,
  is_admin: false,
  is_active: true,
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => {
  cleanup()
  server.resetHandlers()
  useSession.getState().clear()
  localStorage.clear()
})

afterAll(() => server.close())

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

test('shows the unread count badge on the chats navigation item', async () => {
  useSession.setState({ user, status: 'authenticated' })
  server.use(http.get('/api/v1/chats/unread/count', () => HttpResponse.json({ unread_count: 3 })))

  render(<AppShell />, { wrapper: TestProviders })

  expect(await screen.findByLabelText('3 непрочитанных')).toBeInTheDocument()
})
