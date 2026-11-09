import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw'
import { STORAGE_KEYS } from '@/shared/lib/storage'

const user = {
  id: 1,
  email: 'a@b.c',
  username: 'anna',
  phone_number: null,
  is_admin: false,
  is_active: true,
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  localStorage.clear()
  vi.resetModules()
})
afterAll(() => server.close())

test('restores the session from the stored refresh token', async () => {
  localStorage.setItem(STORAGE_KEYS.refresh, 'stored-refresh')

  let refreshCalls = 0
  let meCalls = 0
  server.use(
    http.post('/api/v1/users/refresh', () => {
      refreshCalls += 1
      return HttpResponse.json({
        access_token: 'fresh-access',
        refresh_token: 'rotated-refresh',
        token_type: 'bearer',
        user,
      })
    }),
    http.get('/api/v1/users/me', () => {
      meCalls += 1
      return HttpResponse.json(user)
    }),
  )

  const { bootstrap, useSession } = await import('./session')
  await bootstrap()
  const { getAccessToken } = await import('@/api/token')

  expect(refreshCalls).toBe(1)
  expect(meCalls).toBe(1)
  expect(useSession.getState().status).toBe('authenticated')
  expect(useSession.getState().user).toEqual(user)
  expect(getAccessToken()).toBe('fresh-access')
  expect(localStorage.getItem(STORAGE_KEYS.refresh)).toBe('rotated-refresh')
})

test('falls back to anonymous and clears storage when refresh fails', async () => {
  localStorage.setItem(STORAGE_KEYS.refresh, 'stale-refresh')

  server.use(
    http.post('/api/v1/users/refresh', () =>
      HttpResponse.json(
        { detail: 'Токен недействителен', error_code: 'refresh_token_invalid' },
        { status: 401 },
      ),
    ),
  )

  const { bootstrap, useSession } = await import('./session')
  await bootstrap()
  const { getAccessToken } = await import('@/api/token')

  expect(useSession.getState().status).toBe('anonymous')
  expect(useSession.getState().user).toBeNull()
  expect(localStorage.getItem(STORAGE_KEYS.refresh)).toBeNull()
  expect(getAccessToken()).toBeNull()
})

test('keeps the session recoverable when refresh fails transiently', async () => {
  localStorage.setItem(STORAGE_KEYS.refresh, 'stored-refresh')

  server.use(http.post('/api/v1/users/refresh', () => HttpResponse.error()))

  const { bootstrap, useSession } = await import('./session')
  await bootstrap()

  expect(useSession.getState().status).toBe('authenticated')
  expect(useSession.getState().user).toBeNull()
  expect(localStorage.getItem(STORAGE_KEYS.refresh)).toBe('stored-refresh')
})

test('keeps tokens when /users/me fails with a server error', async () => {
  localStorage.setItem(STORAGE_KEYS.refresh, 'stored-refresh')

  server.use(
    http.post('/api/v1/users/refresh', () =>
      HttpResponse.json({
        access_token: 'fresh-access',
        refresh_token: 'rotated-refresh',
        token_type: 'bearer',
        user,
      }),
    ),
    http.get('/api/v1/users/me', () =>
      HttpResponse.json(
        { detail: 'Сервис временно недоступен', error_code: 'service_unavailable' },
        { status: 503 },
      ),
    ),
  )

  const { bootstrap, useSession } = await import('./session')
  await bootstrap()
  const { getAccessToken } = await import('@/api/token')

  expect(useSession.getState().status).toBe('authenticated')
  expect(useSession.getState().user).toBeNull()
  expect(localStorage.getItem(STORAGE_KEYS.refresh)).toBe('rotated-refresh')
  expect(getAccessToken()).toBe('fresh-access')
})

test('becomes anonymous without a network call when no refresh token is stored', async () => {
  const { bootstrap, useSession } = await import('./session')
  await bootstrap()

  expect(useSession.getState().status).toBe('anonymous')
  expect(useSession.getState().user).toBeNull()
})

test('clears the queued chat messages when the session is cleared or expired', async () => {
  const { useSession } = await import('./session')
  const pending = await import('@/features/chat/pending')
  const { expireSession } = await import('@/api/refresh')

  const queued = {
    id: -1,
    chat_id: 1,
    sender_id: user.id,
    text: 'Черновик',
    is_read: false,
    created_at: new Date().toISOString(),
  }

  pending.setPendingMessage(1, queued)
  useSession.getState().clear()
  expect(pending.getPendingMessage(1)).toBeNull()

  pending.setPendingMessage(1, queued)
  expireSession()
  expect(pending.getPendingMessage(1)).toBeNull()
})
