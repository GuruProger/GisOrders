import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { RequireAuth } from './RequireAuth'
import { useSession } from './session'
import type { User } from '@/entities/user/model'

const user: User = {
  id: 1,
  email: 'a@b.c',
  username: 'anna',
  phone_number: null,
  is_admin: false,
  is_active: true,
}

function LoginProbe() {
  const location = useLocation()
  const state = location.state as { from?: { pathname?: string } } | null
  return <div>login page from {state?.from?.pathname ?? 'nowhere'}</div>
}

function renderAt(initialEntry = '/orders/1') {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<LoginProbe />} />
        <Route element={<RequireAuth />}>
          <Route path="/orders/1" element={<div>protected content</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  act(() => {
    useSession.getState().clear()
  })
})

test('shows a skeleton while the session is loading and does not redirect', () => {
  useSession.setState({ user: null, status: 'loading' })
  renderAt()

  expect(screen.getByRole('status', { name: 'Загрузка сессии' })).toBeInTheDocument()
  expect(screen.queryByText(/login page/)).not.toBeInTheDocument()
})

test('redirects anonymous visitors to /login and remembers the origin', async () => {
  useSession.setState({ user: null, status: 'anonymous' })
  renderAt()

  expect(await screen.findByText('login page from /orders/1')).toBeInTheDocument()
})

test('renders children for an authenticated user', () => {
  useSession.setState({ user, status: 'authenticated' })
  renderAt()

  expect(screen.getByText('protected content')).toBeInTheDocument()
  expect(screen.queryByText(/login page/)).not.toBeInTheDocument()
})
