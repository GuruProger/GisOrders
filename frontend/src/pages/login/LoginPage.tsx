import { Link, useLocation, useNavigate } from 'react-router'
import { LoginForm } from '@/features/auth/LoginForm'
import { returnPath } from '@/shared/lib/returnPath'
import { AuthLayout } from '@/widgets/auth-layout/AuthLayout'

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = returnPath(location.state)

  return (
    <AuthLayout
      title="Вход"
      subtitle="Войдите, чтобы управлять заказами и откликами."
      footer={
        <p>
          Нет аккаунта?{' '}
          <Link
            className="inline-flex min-h-11 items-center font-medium text-moss-600 underline"
            to="/register"
            state={location.state}
          >
            Регистрация
          </Link>
        </p>
      }
    >
      <LoginForm onSubmit={() => navigate(from, { replace: true })} />
    </AuthLayout>
  )
}
