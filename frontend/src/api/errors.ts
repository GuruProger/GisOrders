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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Normalizes backend errors. FastAPI replies either with
 * `{ "detail": "text" }` or with `{ "detail": { "message": "...", "code": "..." } }`.
 */
export async function parseError(response: Response): Promise<ApiError> {
  let message = response.statusText || `Ошибка ${response.status}`
  let code: string | undefined

  try {
    const body: unknown = await response.json()
    if (isRecord(body) && 'detail' in body) {
      const detail = body.detail
      if (typeof detail === 'string') {
        message = detail
      } else if (isRecord(detail)) {
        const { message: detailMessage, code: detailCode } = detail as ErrorDetail
        if (typeof detailMessage === 'string') message = detailMessage
        if (typeof detailCode === 'string') code = detailCode
      }
    }
  } catch {
    // Body is empty or not JSON: keep the status text.
  }

  return new ApiError(message, response.status, code)
}
