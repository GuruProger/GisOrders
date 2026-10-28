import { Link, useLocation, useNavigate } from 'react-router'
import { LoginForm } from '@/features/auth/LoginForm'

interface LoginLocationState {
  from?: { pathname?: string }
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as LoginLocationState | null)?.from?.pathname ?? '/'

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold text-forest-900">Вход</h1>

      <LoginForm onSubmit={() => navigate(from, { replace: true })} />

      <p className="text-sm text-muted">
        Нет аккаунта?{' '}
        <Link className="inline-flex min-h-11 items-center font-medium text-moss-600 underline" to="/register">
          Регистрация
        </Link>
      </p>
    </main>
  )
}
