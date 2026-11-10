import {
  expect,
  type APIRequestContext,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test'

export const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173'
export const CUSTOMER_EMAIL = process.env.E2E_CUSTOMER_EMAIL ?? 'customer_test@example.com'
export const EXECUTOR_EMAIL = process.env.E2E_EXECUTOR_EMAIL ?? 'executor_test@example.com'
export const PASSWORD = process.env.E2E_PASSWORD ?? 'Testpass123'

/** Central Moscow; specs create their orders around it to fit the default 10 km radius. */
export const MOSCOW_CENTER = { lat: 55.7558, lon: 37.6173 }

export type RoleMode = 'customer' | 'executor'

export interface TokenPair {
  access_token: string
  refresh_token: string
  user: { id: number; username: string }
}

export interface CreatedOrder {
  id: number
  title: string
}

interface ChatSummary {
  id: number
  order_id: number
}

function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` }
}

async function readJson<T>(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  const body = await response.text()
  if (!response.ok()) {
    throw new Error(`${response.url()} → ${response.status()} ${body}`)
  }
  return JSON.parse(body) as T
}

/** Signs in through the JSON endpoint so tests can arrange data without the UI. */
export async function apiLogin(
  request: APIRequestContext,
  email: string,
): Promise<TokenPair> {
  const response = await request.post('/api/v1/users/login/json', {
    data: { email, password: PASSWORD },
  })
  return readJson<TokenPair>(response)
}

/**
 * Stores the point, role mode and an optional refresh token before the app
 * boots. The point is required by the feed and avoids geolocation permissions;
 * the refresh token lets a second browser context skip the login form.
 */
export async function seedStorage(
  target: Page | BrowserContext,
  seed: { mode: RoleMode; refreshToken?: string },
): Promise<void> {
  await target.addInitScript(
    ({ mode, refreshToken, point }) => {
      window.localStorage.setItem('gisorders.mode', mode)
      window.localStorage.setItem('gisorders.point', JSON.stringify(point))
      if (refreshToken) window.localStorage.setItem('gisorders.refresh', refreshToken)
    },
    { mode: seed.mode, refreshToken: seed.refreshToken ?? null, point: MOSCOW_CENTER },
  )
}

/** Logs in through the real form and waits for the authenticated feed. */
export async function loginViaUi(
  page: Page,
  email: string,
  mode: RoleMode,
): Promise<void> {
  await seedStorage(page, { mode })
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Пароль').fill(PASSWORD)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('heading', { name: 'Заказы рядом' })).toBeVisible()
}

/** A title that keeps the suite idempotent across runs and projects. */
export function uniqueTitle(prefix: string, testInfo: TestInfo): string {
  return `E2E ${prefix} ${testInfo.project.name} ${Date.now()}`
}

export async function createOrderViaApi(
  request: APIRequestContext,
  token: string,
  title: string,
): Promise<CreatedOrder> {
  const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const response = await request.post('/api/v1/orders/', {
    headers: authHeader(token),
    data: {
      title,
      description: 'E2E: аккуратно спилить дерево и вывезти ветки.',
      min_price: 2_000,
      max_price: 4_000,
      deadline,
      address: 'Москва, Тверская улица, 1',
      tree_type: 'Берёза',
      tree_height: 12,
      tree_diameter: 35,
      photos: [],
      lat: MOSCOW_CENTER.lat,
      lon: MOSCOW_CENTER.lon,
    },
  })
  return readJson<CreatedOrder>(response)
}

export async function createProposalViaApi(
  request: APIRequestContext,
  token: string,
  orderId: number,
  message: string,
): Promise<{ id: number }> {
  const response = await request.post(`/api/v1/orders/${orderId}/proposals`, {
    headers: authHeader(token),
    data: { proposed_price: 3_500, message },
  })
  return readJson<{ id: number }>(response)
}

/** The chat opened by the accepted proposal, looked up by its order. */
export async function findChatId(
  request: APIRequestContext,
  token: string,
  orderId: number,
): Promise<number> {
  const response = await request.get('/api/v1/chats/my', {
    headers: authHeader(token),
  })
  const chats = await readJson<ChatSummary[]>(response)
  const chat = chats.find((item) => item.order_id === orderId)
  if (!chat) throw new Error(`No chat for order ${orderId}`)
  return chat.id
}

/**
 * Best-effort cleanup: deleting an order removes its proposals, chats and
 * messages, which keeps the executor's daily proposal quota free for the next
 * test. An assigned order has to be closed first.
 */
export async function cleanupOrder(
  request: APIRequestContext,
  token: string,
  orderId: number,
): Promise<void> {
  await request.post(`/api/v1/orders/${orderId}/close`, {
    headers: authHeader(token),
  })
  await request.delete(`/api/v1/orders/${orderId}`, {
    headers: authHeader(token),
  })
}

export function localDeadline(daysAhead = 7): string {
  const date = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** Context options for a second browser context with the project's emulation. */
export function projectContextOptions(testInfo: TestInfo): {
  baseURL: string | undefined
  viewport: { width: number; height: number } | null | undefined
  userAgent: string | undefined
  deviceScaleFactor: number | undefined
  isMobile: boolean | undefined
  hasTouch: boolean | undefined
} {
  const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } =
    testInfo.project.use
  return { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch }
}
