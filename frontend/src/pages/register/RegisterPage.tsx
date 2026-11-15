import { Link, useLocation, useNavigate } from 'react-router'
import { RegisterForm } from '@/features/auth/RegisterForm'
import { returnPath } from '@/shared/lib/returnPath'
import { AuthLayout } from '@/widgets/auth-layout/AuthLayout'

export function RegisterPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = returnPath(location.state)

  return (
    <AuthLayout
      title="Регистрация"
      subtitle="Создайте аккаунт, чтобы публиковать заказы и откликаться."
      footer={
        <p>
          Уже есть аккаунт?{' '}
          <Link
            className="inline-flex min-h-11 items-center font-medium text-moss-600 underline"
            to="/login"
            state={location.state}
          >
            Войти
          </Link>
        </p>
      }
    >
      <RegisterForm onSubmit={() => navigate(from, { replace: true })} />
    </AuthLayout>
  )
}
