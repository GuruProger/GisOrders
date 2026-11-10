import { parseError } from './errors'

function jsonResponse(body: unknown, status: number, statusText = ''): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('reads the top-level backend error_code and detail', async () => {
  const error = await parseError(
    jsonResponse(
      { detail: 'Слишком много попыток входа', error_code: 'rate_limited' },
      429,
    ),
  )

  expect(error.message).toBe('Слишком много попыток входа')
  expect(error.code).toBe('rate_limited')
  expect(error.status).toBe(429)
})

test('still supports the legacy nested detail shape', async () => {
  const error = await parseError(
    jsonResponse({ detail: { message: 'Токен недействителен', code: 'invalid_token' } }, 401),
  )

  expect(error.message).toBe('Токен недействителен')
  expect(error.code).toBe('invalid_token')
})

test('uses the first message of a FastAPI validation array', async () => {
  const error = await parseError(
    jsonResponse(
      {
        detail: [
          { msg: 'Поле обязательно', loc: ['body', 'email'] },
          { msg: 'Слишком короткий пароль', loc: ['body', 'password'] },
        ],
      },
      422,
    ),
  )

  expect(error.message).toBe('Поле обязательно')
  expect(error.code).toBeUndefined()
})

test('falls back to a Russian message when a validation array has no message', async () => {
  const error = await parseError(jsonResponse({ detail: [] }, 422))

  expect(error.message).toBe('Не удалось выполнить запрос')
})

test('does not surface English FastAPI validation messages', async () => {
  const error = await parseError(
    jsonResponse({ detail: [{ msg: 'Field required', loc: ['body', 'email'] }] }, 422),
  )

  expect(error.message).toBe('Не удалось выполнить запрос')
})

test('never surfaces the English HTTP status text', async () => {
  const error = await parseError(
    new Response(null, { status: 422, statusText: 'Unprocessable Entity' }),
  )

  expect(error.message).toBe('Не удалось выполнить запрос')
  expect(error.message).not.toContain('Unprocessable')
})
