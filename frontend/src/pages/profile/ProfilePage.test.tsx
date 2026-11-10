import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router'
import type { User } from '@/api/types'
import { useSession } from '@/features/auth/session'
import { normalizePhone } from '@/features/auth/profile-api'
import { server } from '@/test/msw'
import { TestProviders } from '@/test/providers'
import { AppShell } from '@/widgets/app-shell/AppShell'
import { ProfilePage } from './ProfilePage'

const baseUser: User = {
  id: 2,
  email: 'anna@example.com',
  username: 'Анна Петрова',
  phone_number: null,
  is_admin: false,
  is_active: true,
}

function renderProfile() {
  return render(
    <TestProviders initialEntries={['/profile']}>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/login" element={<p>Страница входа</p>} />
      </Routes>
    </TestProviders>,
  )
}

function renderWithHeader() {
  return render(
    <TestProviders initialEntries={['/profile']}>
      <Routes>
        <Route path="/login" element={<p>Страница входа</p>} />
        <Route element={<AppShell />}>
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </TestProviders>,
  )
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

beforeEach(() => {
  localStorage.clear()
  useSession.setState({ user: baseUser, status: 'authenticated' })
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
  useSession.getState().clear()
  localStorage.clear()
})

afterAll(() => server.close())

test('saves only username and phone, normalizes the phone and refreshes the header', async () => {
  let payload: Record<string, unknown> | undefined
  const updated: User = { ...baseUser, username: 'Иван Сидоров', phone_number: '+79123456767' }
  server.use(
    http.get('/api/v1/chats/unread/count', () => HttpResponse.json({ unread_count: 0 })),
    http.patch('/api/v1/users/me', async ({ request }) => {
      payload = (await request.json()) as Record<string, unknown>
      return HttpResponse.json(updated)
    }),
  )

  renderWithHeader()

  const header = screen.getByRole('banner')
  expect(within(header).getByText('АП')).toBeInTheDocument()

  await userEvent.clear(screen.getByLabelText('Имя'))
  await userEvent.type(screen.getByLabelText('Имя'), 'Иван Сидоров')
  await userEvent.type(screen.getByLabelText('Телефон'), '8 912 345-67-67')
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

  await waitFor(() =>
    expect(payload).toEqual({
      username: 'Иван Сидоров',
      phone_number: '+79123456767',
    }),
  )
  expect(payload).not.toHaveProperty('email')
  expect(payload).not.toHaveProperty('phone')
  expect(await screen.findByText('Профиль обновлён')).toBeInTheDocument()
  expect(useSession.getState().user).toMatchObject({
    username: 'Иван Сидоров',
    phone_number: '+79123456767',
  })
  expect(within(header).getByText('ИС')).toBeInTheDocument()
})

test('normalizes trunk, digit-only and formatted phone numbers', () => {
  expect(normalizePhone('8 999 123-45-67')).toBe('+79991234567')
  expect(normalizePhone('+7 (912) 345-67-67')).toBe('+79123456767')
  expect(normalizePhone('9991234567')).toBe('+79991234567')
  expect(normalizePhone('')).toBeNull()
  expect(normalizePhone('123')).toBeNull()
})

test('rejects a malformed phone locally without a request', async () => {
  let patches = 0
  server.use(
    http.patch('/api/v1/users/me', () => {
      patches += 1
      return HttpResponse.json(baseUser)
    }),
  )

  renderProfile()

  await userEvent.type(screen.getByLabelText('Телефон'), '123')
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

  expect(
    await screen.findByText('Введите номер в формате +7XXXXXXXXXX'),
  ).toBeInTheDocument()
  expect(patches).toBe(0)
})

test('sends null when the phone is cleared', async () => {
  useSession.setState({
    user: { ...baseUser, phone_number: '+79991234567' },
    status: 'authenticated',
  })

  let payload: Record<string, unknown> | undefined
  server.use(
    http.patch('/api/v1/users/me', async ({ request }) => {
      payload = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ ...baseUser, phone_number: null })
    }),
  )

  renderProfile()

  await userEvent.clear(screen.getByLabelText('Телефон'))
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

  await waitFor(() =>
    expect(payload).toEqual({
      username: 'Анна Петрова',
      phone_number: null,
    }),
  )
})

test('surfaces a duplicate username from the API', async () => {
  server.use(
    http.patch('/api/v1/users/me', () =>
      HttpResponse.json(
        { detail: 'Имя пользователя уже занято', error_code: 'username_duplicate' },
        { status: 409 },
      ),
    ),
  )

  renderProfile()

  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

  expect(await screen.findByText('Имя пользователя уже занято')).toBeInTheDocument()
  expect(useSession.getState().user?.username).toBe('Анна Петрова')
})

test('password form mirrors the backend rules with hints', () => {
  renderProfile()

  expect(screen.getByText('8 символов')).toBeInTheDocument()
  expect(screen.getByText('Заглавная буква')).toBeInTheDocument()
  expect(screen.getByText('Цифра')).toBeInTheDocument()
})

test('password form rejects «password» with the backend rule texts', async () => {
  let requests = 0
  server.use(
    http.post('/api/v1/users/me/password', () => {
      requests += 1
      return new HttpResponse(null, { status: 204 })
    }),
  )

  renderProfile()

  await userEvent.type(screen.getByLabelText('Текущий пароль'), 'password')
  await userEvent.type(screen.getByLabelText('Новый пароль'), 'password')
  await userEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }))

  expect(
    await screen.findByText('Пароль должен содержать хотя бы одну заглавную букву'),
  ).toBeInTheDocument()
  expect(
    screen.getByText('Пароль должен содержать хотя бы одну цифру'),
  ).toBeInTheDocument()
  expect(screen.getByText('8 символов')).toBeInTheDocument()
  expect(requests).toBe(0)
})

test('password form rejects a new password shorter than eight characters', async () => {
  let requests = 0
  server.use(
    http.post('/api/v1/users/me/password', () => {
      requests += 1
      return new HttpResponse(null, { status: 204 })
    }),
  )

  renderProfile()

  await userEvent.type(screen.getByLabelText('Текущий пароль'), 'OldPass1')
  await userEvent.type(screen.getByLabelText('Новый пароль'), 'Ab1')
  await userEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }))

  expect(
    await screen.findByText('Пароль должен содержать минимум 8 символов'),
  ).toBeInTheDocument()
  expect(requests).toBe(0)
})

test('a wrong current password stays inline and keeps the session', async () => {
  localStorage.setItem('gisorders.refresh', 'refresh-1')
  let refreshCalls = 0
  server.use(
    http.post('/api/v1/users/me/password', () =>
      HttpResponse.json(
        { detail: 'Текущий пароль неверен', error_code: 'invalid_password' },
        { status: 401 },
      ),
    ),
    http.post('/api/v1/users/refresh', () => {
      refreshCalls += 1
      return HttpResponse.json({
        access_token: 'fresh',
        refresh_token: 'refresh-2',
        token_type: 'bearer',
        user: baseUser,
      })
    }),
  )

  renderProfile()

  await userEvent.type(screen.getByLabelText('Текущий пароль'), 'wrong-password')
  await userEvent.type(screen.getByLabelText('Новый пароль'), 'Another123')
  await userEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }))

  expect(await screen.findByText('Текущий пароль неверен')).toBeInTheDocument()
  expect(refreshCalls).toBe(0)
  expect(useSession.getState().user).not.toBeNull()
  expect(useSession.getState().status).toBe('authenticated')
  expect(screen.queryByText('Страница входа')).not.toBeInTheDocument()
})

test('shows a Russian fallback when the password change fails without an api error', async () => {
  server.use(http.post('/api/v1/users/me/password', () => HttpResponse.error()))

  renderProfile()

  await userEvent.type(screen.getByLabelText('Текущий пароль'), 'OldPass1')
  await userEvent.type(screen.getByLabelText('Новый пароль'), 'NewPass123')
  await userEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }))

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Не удалось изменить пароль')
  expect(alert).not.toHaveTextContent('Failed to fetch')
})

test('shows the api detail when the password change is rejected', async () => {
  server.use(
    http.post('/api/v1/users/me/password', () =>
      HttpResponse.json({ detail: 'Сервер недоступен' }, { status: 500 }),
    ),
  )

  renderProfile()

  await userEvent.type(screen.getByLabelText('Текущий пароль'), 'OldPass1')
  await userEvent.type(screen.getByLabelText('Новый пароль'), 'NewPass123')
  await userEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }))

  expect(await screen.findByText('Сервер недоступен')).toBeInTheDocument()
})

test('a successful password change clears the session and redirects', async () => {
  server.use(
    http.post('/api/v1/users/me/password', () => new HttpResponse(null, { status: 204 })),
  )

  renderProfile()

  await userEvent.type(screen.getByLabelText('Текущий пароль'), 'OldPass1')
  await userEvent.type(screen.getByLabelText('Новый пароль'), 'NewPass123')
  await userEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }))

  expect(await screen.findByText('Страница входа')).toBeInTheDocument()
  expect(screen.getByText('Пароль изменён. Войдите заново')).toBeInTheDocument()
  expect(useSession.getState().user).toBeNull()
  expect(useSession.getState().status).toBe('anonymous')
})

test('delete account requires typing the confirmation word', async () => {
  renderProfile()

  await userEvent.click(screen.getByRole('button', { name: 'Удалить аккаунт' }))

  const confirm = screen.getByRole('button', { name: 'Удалить навсегда' })
  expect(confirm).toBeDisabled()

  const input = screen.getByLabelText('Введите «удалить»')
  await userEvent.type(input, 'удалить аккаунт')
  expect(confirm).toBeDisabled()

  await userEvent.clear(input)
  await userEvent.type(input, '  УДАЛИТЬ  ')
  expect(confirm).toBeEnabled()
})

test('a successful deletion clears the session and redirects', async () => {
  let deletes = 0
  server.use(
    http.delete('/api/v1/users/me', () => {
      deletes += 1
      return new HttpResponse(null, { status: 204 })
    }),
  )

  renderProfile()

  await userEvent.click(screen.getByRole('button', { name: 'Удалить аккаунт' }))
  await userEvent.type(screen.getByLabelText('Введите «удалить»'), 'удалить')
  await userEvent.click(screen.getByRole('button', { name: 'Удалить навсегда' }))

  expect(await screen.findByText('Страница входа')).toBeInTheDocument()
  expect(screen.getByText('Аккаунт удалён')).toBeInTheDocument()
  expect(deletes).toBe(1)
  expect(useSession.getState().user).toBeNull()
  expect(useSession.getState().status).toBe('anonymous')
})

test('logout calls the API with the refresh token and redirects', async () => {
  localStorage.setItem('gisorders.refresh', 'refresh-1')
  let payload: Record<string, unknown> | undefined
  server.use(
    http.post('/api/v1/users/logout', async ({ request }) => {
      payload = (await request.json()) as Record<string, unknown>
      return new HttpResponse(null, { status: 204 })
    }),
  )

  renderProfile()

  await userEvent.click(screen.getByRole('button', { name: 'Выйти' }))

  expect(await screen.findByText('Страница входа')).toBeInTheDocument()
  expect(payload).toEqual({ refresh_token: 'refresh-1' })
  expect(useSession.getState().user).toBeNull()
  expect(localStorage.getItem('gisorders.refresh')).toBeNull()
})

test('a failing logout still redirects without an unhandled rejection', async () => {
  localStorage.setItem('gisorders.refresh', 'refresh-1')
  server.use(
    http.post('/api/v1/users/logout', () =>
      HttpResponse.json({ detail: 'Ошибка сервера' }, { status: 500 }),
    ),
  )

  renderProfile()

  await userEvent.click(screen.getByRole('button', { name: 'Выйти' }))

  expect(await screen.findByText('Страница входа')).toBeInTheDocument()
  expect(useSession.getState().user).toBeNull()
  expect(localStorage.getItem('gisorders.refresh')).toBeNull()
})

test('loads the profile when the session has no user data yet', async () => {
  useSession.setState({ user: null, status: 'authenticated' })
  let fetches = 0
  server.use(
    http.get('/api/v1/users/me', () => {
      fetches += 1
      return HttpResponse.json(baseUser)
    }),
  )

  renderProfile()

  await waitFor(() => {
    expect(screen.getByText('Анна Петрова')).toBeInTheDocument()
    expect(useSession.getState().user).toMatchObject({ username: 'Анна Петрова' })
  })
  expect(fetches).toBe(1)
})
