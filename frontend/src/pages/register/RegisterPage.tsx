import { Link, useNavigate } from 'react-router'
import { RegisterForm } from '@/features/auth/RegisterForm'

export function RegisterPage() {
  const navigate = useNavigate()

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold text-forest-900">Регистрация</h1>

      <RegisterForm onSubmit={() => navigate('/', { replace: true })} />

      <p className="text-sm text-muted">
        Уже есть аккаунт?{' '}
        <Link className="inline-flex min-h-11 items-center font-medium text-moss-600 underline" to="/login">
          Войти
        </Link>
      </p>
    </main>
  )
}
