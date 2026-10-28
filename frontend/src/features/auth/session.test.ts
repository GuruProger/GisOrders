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
        { detail: { message: 'Токен недействителен', code: 'invalid_token' } },
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

test('becomes anonymous without a network call when no refresh token is stored', async () => {
  const { bootstrap, useSession } = await import('./session')
  await bootstrap()

  expect(useSession.getState().status).toBe('anonymous')
  expect(useSession.getState().user).toBeNull()
})
