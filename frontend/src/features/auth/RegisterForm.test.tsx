import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/test/msw'
import { RegisterForm } from './RegisterForm'
import { TestProviders } from '@/test/providers'

const user = {
  id: 7,
  email: 'anna@example.com',
  username: 'anna',
  phone_number: '+79991234567',
  is_admin: false,
  is_active: true,
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  localStorage.clear()
})
afterAll(() => server.close())

test('shows validation errors for an empty form', async () => {
  render(<RegisterForm onSubmit={vi.fn()} />, { wrapper: TestProviders })

  await userEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

  expect(await screen.findByText('Введите email')).toBeInTheDocument()
  expect(await screen.findByText('Введите имя пользователя')).toBeInTheDocument()
  expect(await screen.findByText('Пароль должен содержать минимум 8 символов')).toBeInTheDocument()
})

test('marks password requirements as they are met', async () => {
  render(<RegisterForm onSubmit={vi.fn()} />, { wrapper: TestProviders })

  const requirement = (label: string) => screen.getByText(label).closest('li')
  expect(requirement('8 символов')).toHaveAttribute('data-met', 'false')
  expect(requirement('Заглавная буква')).toHaveAttribute('data-met', 'false')
  expect(requirement('Цифра')).toHaveAttribute('data-met', 'false')

  await userEvent.type(screen.getByLabelText('Пароль'), 'Password123')

  expect(requirement('8 символов')).toHaveAttribute('data-met', 'true')
  expect(requirement('Заглавная буква')).toHaveAttribute('data-met', 'true')
  expect(requirement('Цифра')).toHaveAttribute('data-met', 'true')
})

test('registers, logs in automatically and returns the user', async () => {
  let registerBody: unknown = null
  server.use(
    http.post('/api/v1/users/register', async ({ request }) => {
      registerBody = await request.json()
      return HttpResponse.json(user)
    }),
    http.post('/api/v1/users/login/json', () =>
      HttpResponse.json({
        access_token: 'a',
        refresh_token: 'r',
        token_type: 'bearer',
        user,
      }),
    ),
  )

  const onSuccess = vi.fn()
  render(<RegisterForm onSubmit={onSuccess} />, { wrapper: TestProviders })

  await userEvent.type(screen.getByLabelText('Email'), 'anna@example.com')
  await userEvent.type(screen.getByLabelText('Имя пользователя'), 'anna')
  await userEvent.type(screen.getByLabelText('Телефон'), '+79991234567')
  await userEvent.type(screen.getByLabelText('Пароль'), 'Password123')
  await userEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }))

  await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledWith(user))
  expect(registerBody).toEqual({
    email: 'anna@example.com',
    username: 'anna',
    phone_number: '+79991234567',
    password: 'Password123',
  })
  expect(localStorage.getItem('gisorders.refresh')).toBe('r')
})
