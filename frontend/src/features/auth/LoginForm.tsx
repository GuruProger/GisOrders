import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { User } from '@/entities/user/model'
import { zodResolver } from '@/shared/lib/zodResolver'
import { Button } from '@/shared/ui/Button'
import { Field } from '@/shared/ui/Field'
import { Input } from '@/shared/ui/Input'
import { mutationErrorMessage, useLogin } from './api'

// A permissive check: zod v4's built-in email regex rejects short domains
// such as `a@b.c`, which the backend (and the task's fixtures) accept.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const loginSchema = z.object({
  email: z.string().min(1, 'Введите email').regex(EMAIL_PATTERN, 'Введите корректный email'),
  password: z.string().min(1, 'Введите пароль'),
})

type LoginValues = z.infer<typeof loginSchema>

export interface LoginFormProps {
  onSubmit?: (user: User) => void
}

export function LoginForm({ onSubmit }: LoginFormProps) {
  const loginMutation = useLogin()
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const serverError = mutationErrorMessage(loginMutation.error, 'Не удалось войти')

  const submit = handleSubmit(async (values) => {
    try {
      const pair = await loginMutation.mutateAsync(values)
      onSubmit?.(pair.user)
    } catch {
      // The mutation error is rendered inside the form.
    }
  })

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <Field label="Email" htmlFor="login-email" error={errors.email?.message}>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          {...register('email')}
        />
      </Field>

      <Field label="Пароль" htmlFor="login-password" error={errors.password?.message}>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
      </Field>

      {serverError && (
        <p role="alert" className="text-sm text-terracotta-600">
          {serverError}
        </p>
      )}

      <Button type="submit" loading={loginMutation.isPending}>
        Войти
      </Button>
    </form>
  )
}
