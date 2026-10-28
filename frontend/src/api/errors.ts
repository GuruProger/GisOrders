export class ApiError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

interface ErrorDetail {
  message?: unknown
  code?: unknown
}

const GENERIC_ERROR_MESSAGE = 'Не удалось выполнить запрос'

/**
 * Error codes the backend uses when the session itself is no longer valid.
 * Kept in sync with `backend/core/security.py` and the refresh-token service.
 */
const AUTH_ERROR_CODES = new Set([
  'authentication_failed',
  'invalid_credentials',
  'refresh_token_expired',
  'refresh_token_invalid',
  'refresh_token_reuse',
  'token_expired',
  'token_invalid',
  'token_invalid_payload',
  'token_missing',
  'token_type_invalid',
  'unauthorized',
  'user_blocked',
  'user_not_found',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function firstValidationMessage(items: unknown[]): string | undefined {
  for (const item of items) {
    if (!isRecord(item)) continue
    const message = item.msg
    if (typeof message === 'string' && message.trim()) return message
  }
  return undefined
}

/**
 * Normalizes backend errors. The production contract is
 * `{ "detail": "text", "error_code": "code" }`; FastAPI schema validation
 * replies with `{ "detail": [ { "msg": "...", "loc": [...] } ] }`, and older
 * services may still nest `{ "detail": { "message": "...", "code": "..." } }`.
 */
export async function parseError(response: Response): Promise<ApiError> {
  let message: string | undefined
  let code: string | undefined

  try {
    const body: unknown = await response.json()
    if (isRecord(body)) {
      if (typeof body.error_code === 'string' && body.error_code) {
        code = body.error_code
      }

      const detail = body.detail
      if (typeof detail === 'string' && detail.trim()) {
        message = detail
      } else if (Array.isArray(detail)) {
        message = firstValidationMessage(detail)
      } else if (isRecord(detail)) {
        const { message: detailMessage, code: detailCode } = detail as ErrorDetail
        if (typeof detailMessage === 'string' && detailMessage.trim()) message = detailMessage
        if (!code && typeof detailCode === 'string' && detailCode) code = detailCode
      }
    }
  } catch {
    // Body is empty or not JSON: fall back to a localized generic message.
  }

  // Never show an English HTTP status phrase to users.
  if (!message) {
    message =
      response.status >= 400
        ? GENERIC_ERROR_MESSAGE
        : response.statusText || `Ошибка ${response.status}`
  }

  return new ApiError(message, response.status, code)
}

/**
 * True when an error means the stored credentials are no longer valid, as
 * opposed to a transient network, timeout or server failure.
 */
export function isAuthenticationError(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  if (error.status === 401 || error.status === 403) return true
  return error.code !== undefined && AUTH_ERROR_CODES.has(error.code)
}
