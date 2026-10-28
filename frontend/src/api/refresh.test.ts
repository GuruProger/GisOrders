import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw'
import { STORAGE_KEYS } from '@/shared/lib/storage'
import { onSessionExpired, refreshSession } from './refresh'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  localStorage.clear()
})
afterAll(() => server.close())

test('keeps the refresh token when the network is unavailable', async () => {
  localStorage.setItem(STORAGE_KEYS.refresh, 'stored-refresh')
  const onExpired = vi.fn()
  const unsubscribe = onSessionExpired(onExpired)

  server.use(http.post('/api/v1/users/refresh', () => HttpResponse.error()))

  await expect(refreshSession()).rejects.toThrow()

  expect(localStorage.getItem(STORAGE_KEYS.refresh)).toBe('stored-refresh')
  expect(onExpired).not.toHaveBeenCalled()
  unsubscribe()
})

test('keeps the refresh token on a 503 response', async () => {
  localStorage.setItem(STORAGE_KEYS.refresh, 'stored-refresh')
  const onExpired = vi.fn()
  const unsubscribe = onSessionExpired(onExpired)

  server.use(
    http.post('/api/v1/users/refresh', () =>
      HttpResponse.json(
        { detail: 'Сервис временно недоступен', error_code: 'service_unavailable' },
        { status: 503 },
      ),
    ),
  )

  await expect(refreshSession()).rejects.toMatchObject({ status: 503 })

  expect(localStorage.getItem(STORAGE_KEYS.refresh)).toBe('stored-refresh')
  expect(onExpired).not.toHaveBeenCalled()
  unsubscribe()
})

test('expires the session when refresh is rejected', async () => {
  localStorage.setItem(STORAGE_KEYS.refresh, 'stored-refresh')
  const onExpired = vi.fn()
  const unsubscribe = onSessionExpired(onExpired)

  server.use(
    http.post('/api/v1/users/refresh', () =>
      HttpResponse.json(
        { detail: 'Недействительный refresh-токен', error_code: 'refresh_token_invalid' },
        { status: 401 },
      ),
    ),
  )

  await expect(refreshSession()).rejects.toMatchObject({ status: 401 })

  expect(localStorage.getItem(STORAGE_KEYS.refresh)).toBeNull()
  expect(onExpired).toHaveBeenCalledTimes(1)
  unsubscribe()
})
