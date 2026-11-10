import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes, useLocation } from 'react-router'
import { server } from '@/test/msw'
import { TestProviders } from '@/test/providers'
import { LoginPage } from './LoginPage'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  localStorage.clear()
})
afterAll(() => server.close())

const user = {
  id: 1,
  email: 'a@b.c',
  username: 'anna',
  phone_number: null,
  is_admin: false,
  is_active: true,
}

function LocationProbe() {
  const location = useLocation()
  return (
    <p data-testid="location">
      {location.pathname}
      {location.search}
      {location.hash}
    </p>
  )
}

function StateProbe() {
  const location = useLocation()
  return <p data-testid="state">{JSON.stringify(location.state)}</p>
}

test('returns to the original path including query and hash after login', async () => {
  server.use(
    http.post('/api/v1/users/login/json', () =>
      HttpResponse.json({
        access_token: 'a',
        refresh_token: 'r',
        token_type: 'bearer',
        user,
      }),
    ),
  )

  render(
    <TestProviders
      initialEntries={[
        {
          pathname: '/login',
          state: { from: { pathname: '/orders', search: '?page=2', hash: '#top' } },
        },
      ]}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </TestProviders>,
  )

  await userEvent.type(screen.getByLabelText('Email'), 'a@b.c')
  await userEvent.type(screen.getByLabelText('Пароль'), 'Password123')
  await userEvent.click(screen.getByRole('button', { name: 'Войти' }))

  expect(await screen.findByTestId('location')).toHaveTextContent('/orders?page=2#top')
})

test('passes the return state through the registration link', async () => {
  render(
    <TestProviders
      initialEntries={[
        {
          pathname: '/login',
          state: { from: { pathname: '/my/orders', search: '?page=3', hash: '#list' } },
        },
      ]}
    >
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<StateProbe />} />
      </Routes>
    </TestProviders>,
  )

  await userEvent.click(screen.getByRole('link', { name: 'Регистрация' }))

  expect(await screen.findByTestId('state')).toHaveTextContent(
    '/my/orders',
  )
  expect(screen.getByTestId('state')).toHaveTextContent('?page=3')
  expect(screen.getByTestId('state')).toHaveTextContent('#list')
})
