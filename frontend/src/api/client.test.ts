import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw'
import { apiRequest } from './client'
import { setAccessToken } from './token'
import { onSessionExpired } from './refresh'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  setAccessToken(null)
  localStorage.clear()
})
afterAll(() => server.close())

test('sends bearer token', async () => {
  setAccessToken('access-1')
  let seen: string | null = null
  server.use(
    http.get('/api/v1/orders/1', ({ request }) => {
      seen = request.headers.get('Authorization')
      return HttpResponse.json({ id: 1 })
    }),
  )

  const { data } = await apiRequest<{ id: number }>('/orders/1')

  expect(seen).toBe('Bearer access-1')
  expect(data.id).toBe(1)
})

test('refreshes once for concurrent 401 responses and retries', async () => {
  localStorage.setItem('gisorders.refresh', 'refresh-1')
  setAccessToken('expired')
  let refreshCalls = 0
  server.use(
    http.get('/api/v1/orders/1', ({ request }) =>
      request.headers.get('Authorization') === 'Bearer fresh'
        ? HttpResponse.json({ id: 1 })
        : HttpResponse.json({ detail: 'expired' }, { status: 401 }),
    ),
    http.get('/api/v1/orders/2', ({ request }) =>
      request.headers.get('Authorization') === 'Bearer fresh'
        ? HttpResponse.json({ id: 2 })
        : HttpResponse.json({ detail: 'expired' }, { status: 401 }),
    ),
    http.post('/api/v1/users/refresh', () => {
      refreshCalls += 1
      return HttpResponse.json({
        access_token: 'fresh',
        refresh_token: 'refresh-2',
        token_type: 'bearer',
        user: { id: 1 },
      })
    }),
  )

  const [first, second] = await Promise.all([apiRequest('/orders/1'), apiRequest('/orders/2')])

  expect(refreshCalls).toBe(1)
  expect(first.data).toEqual({ id: 1 })
  expect(second.data).toEqual({ id: 2 })
})

test('emits session expired and clears tokens when refresh fails', async () => {
  localStorage.setItem('gisorders.refresh', 'refresh-1')
  const onExpired = vi.fn()
  const unsubscribe = onSessionExpired(onExpired)
  server.use(
    http.get('/api/v1/orders/1', () => HttpResponse.json({ detail: 'expired' }, { status: 401 })),
    http.post('/api/v1/users/refresh', () => HttpResponse.json({ detail: 'revoked' }, { status: 401 })),
  )

  await expect(apiRequest('/orders/1')).rejects.toMatchObject({ status: 401 })

  expect(onExpired).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem('gisorders.refresh')).toBeNull()
  unsubscribe()
})

test('performs refresh inside a cross-tab lock', async () => {
  localStorage.setItem('gisorders.refresh', 'refresh-1')
  setAccessToken('expired')
  const request = vi.fn((_name: string, cb: () => Promise<unknown>) => cb())
  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true })
  server.use(
    http.get('/api/v1/orders/1', ({ request: req }) =>
      req.headers.get('Authorization') === 'Bearer fresh'
        ? HttpResponse.json({ id: 1 })
        : HttpResponse.json({ detail: 'expired' }, { status: 401 }),
    ),
    http.post('/api/v1/users/refresh', () =>
      HttpResponse.json({
        access_token: 'fresh',
        refresh_token: 'refresh-2',
        token_type: 'bearer',
        user: { id: 1 },
      }),
    ),
  )

  await apiRequest('/orders/1')

  expect(request).toHaveBeenCalledWith('gisorders-refresh', expect.any(Function))
})

test('parses X-Total-Count when present', async () => {
  server.use(
    http.get('/api/v1/orders/available', () =>
      HttpResponse.json([{ id: 1 }], { headers: { 'X-Total-Count': '42' } }),
    ),
  )

  const result = await apiRequest('/orders/available')

  expect(result.total).toBe(42)
})
