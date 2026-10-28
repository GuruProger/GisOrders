import { getRefreshToken } from '@/shared/lib/storage'
import { parseError } from './errors'
import { expireSession, isRefreshPath, refreshSession } from './refresh'
import { getAccessToken } from './token'
import { apiUrl } from './url'

const TIMEOUT_MS = 15_000

export interface ApiResult<T> {
  data: T
  total: number | null
}

function requestSignal(callerSignal: AbortSignal | null | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  if (!callerSignal) return timeout
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([callerSignal, timeout])
  return callerSignal
}

async function send(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = getAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')

  return fetch(apiUrl(path), {
    ...init,
    headers,
    signal: requestSignal(init.signal),
  })
}

function readTotal(response: Response): number | null {
  const raw = response.headers.get('X-Total-Count')
  if (raw === null) return null
  const total = Number.parseInt(raw, 10)
  return Number.isFinite(total) ? total : null
}

async function readResponse<T>(response: Response): Promise<ApiResult<T>> {
  if (!response.ok) throw await parseError(response)
  if (response.status === 204) return { data: null as T, total: null }

  return { data: (await response.json()) as T, total: readTotal(response) }
}

/**
 * Performs an API call: injects the access token, refreshes it once on 401 and
 * retries the request, and exposes `X-Total-Count` as `total`.
 */
export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  const response = await send(path, init)

  if (response.status !== 401 || isRefreshPath(path)) return readResponse<T>(response)

  // Without a refresh token there is nothing to renew: surface the 401 as is.
  if (!getRefreshToken()) return readResponse<T>(response)

  // `refreshSession` is single-flight; its failures already expire the session.
  await refreshSession()

  const retried = await send(path, init)
  if (retried.status === 401) {
    expireSession()
    throw await parseError(retried)
  }

  return readResponse<T>(retried)
}
