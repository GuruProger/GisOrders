import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw'
import { LoginForm } from './LoginForm'
import { TestProviders } from '@/test/providers'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  localStorage.clear()
})
afterAll(() => server.close())

test('shows validation error for empty email', async () => {
  render(<LoginForm onSubmit={vi.fn()} />, { wrapper: TestProviders })
  await userEvent.click(screen.getByRole('button', { name: 'Войти' }))
  expect(await screen.findByText('Введите email')).toBeInTheDocument()
})

test('submits credentials and returns user', async () => {
  server.use(
    http.post('/api/v1/users/login/json', () =>
      HttpResponse.json({
        access_token: 'a',
        refresh_token: 'r',
        token_type: 'bearer',
        user: {
          id: 1,
          email: 'a@b.c',
          username: 'anna',
          phone_number: null,
          is_admin: false,
          is_active: true,
        },
      }),
    ),
  )
  const onSuccess = vi.fn()
  render(<LoginForm onSubmit={onSuccess} />, { wrapper: TestProviders })

  await userEvent.type(screen.getByLabelText('Email'), 'a@b.c')
  await userEvent.type(screen.getByLabelText('Пароль'), 'Password123')
  await userEvent.click(screen.getByRole('button', { name: 'Войти' }))

  await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled())
})

test('shows the server rate-limit message above the submit button', async () => {
  server.use(
    http.post('/api/v1/users/login/json', () =>
      HttpResponse.json(
        { detail: { message: 'Слишком много попыток входа', code: 'rate_limited' } },
        { status: 429 },
      ),
    ),
  )
  render(<LoginForm onSubmit={vi.fn()} />, { wrapper: TestProviders })

  await userEvent.type(screen.getByLabelText('Email'), 'a@b.c')
  await userEvent.type(screen.getByLabelText('Пароль'), 'Password123')
  const submit = screen.getByRole('button', { name: 'Войти' })
  await userEvent.click(submit)

  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('Слишком много попыток входа')
  expect(alert.compareDocumentPosition(submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})
