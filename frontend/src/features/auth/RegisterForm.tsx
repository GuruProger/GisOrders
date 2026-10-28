import { useController, useForm } from 'react-hook-form'
import { z } from 'zod'
import type { User } from '@/entities/user/model'
import { zodResolver } from '@/shared/lib/zodResolver'
import { Button } from '@/shared/ui/Button'
import { Field } from '@/shared/ui/Field'
import { Input } from '@/shared/ui/Input'
import { mutationErrorMessage, useRegister } from './api'

const PHONE_PATTERN = /^\+7\d{10}$/
// A permissive check: zod v4's built-in email regex rejects short domains
// such as `a@b.c`, which the backend (and the task's fixtures) accept.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const registerSchema = z.object({
  email: z.string().min(1, 'Введите email').regex(EMAIL_PATTERN, 'Введите корректный email'),
  username: z.string().min(1, 'Введите имя пользователя'),
  phone: z
    .string()
    .refine((value) => value === '' || PHONE_PATTERN.test(value), 'Телефон в формате +7XXXXXXXXXX'),
  password: z
    .string()
    .min(8, 'Пароль должен содержать минимум 8 символов')
    .regex(/[A-ZА-ЯЁ]/, 'Пароль должен содержать заглавную букву')
    .regex(/\d/, 'Пароль должен содержать цифру'),
})

type RegisterValues = z.infer<typeof registerSchema>

export interface RegisterFormProps {
  onSubmit?: (user: User) => void
}

/** Keeps the Russian phone number in the `+7XXXXXXXXXX` shape while typing. */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const national = digits.startsWith('7') || digits.startsWith('8') ? digits.slice(1) : digits
  return `+7${national.slice(0, 10)}`
}

function PasswordRequirements({ password }: { password: string }) {
  const requirements = [
    { label: '8 символов', met: password.length >= 8 },
    { label: 'Заглавная буква', met: /[A-ZА-ЯЁ]/.test(password) },
    { label: 'Цифра', met: /\d/.test(password) },
  ]

  return (
    <ul id="register-password-requirements" aria-label="Требования к паролю" className="flex flex-col gap-1 text-sm">
      {requirements.map(({ label, met }) => (
        <li
          key={label}
          data-met={met ? 'true' : 'false'}
          className={met ? 'text-moss-600' : 'text-muted-strong'}
        >
          <span aria-hidden="true">{met ? '✓' : '•'}</span> <span>{label}</span>
        </li>
      ))}
    </ul>
  )
}

export function RegisterForm({ onSubmit }: RegisterFormProps) {
  const registerMutation = useRegister()
  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', username: '', phone: '', password: '' },
  })

  const phone = useController({ control, name: 'phone' })
  const password = watch('password')
  const serverError = mutationErrorMessage(registerMutation.error, 'Не удалось зарегистрироваться')

  const submit = handleSubmit(async (values) => {
    try {
      const pair = await registerMutation.mutateAsync({
        email: values.email,
        username: values.username,
        phone_number: values.phone === '' ? null : values.phone,
        password: values.password,
      })
      onSubmit?.(pair.user)
    } catch {
      // The mutation error is rendered inside the form.
    }
  })

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <Field label="Email" htmlFor="register-email" error={errors.email?.message}>
        <Input
          id="register-email"
          type="email"
          autoComplete="email"
          {...register('email')}
        />
      </Field>

      <Field label="Имя пользователя" htmlFor="register-username" error={errors.username?.message}>
        <Input
          id="register-username"
          type="text"
          autoComplete="username"
          {...register('username')}
        />
      </Field>

      <Field
        label="Телефон"
        htmlFor="register-phone"
        error={errors.phone?.message}
        hint="Необязательно, формат +7XXXXXXXXXX"
      >
        <Input
          id="register-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+7XXXXXXXXXX"
          name={phone.field.name}
          value={phone.field.value}
          onBlur={phone.field.onBlur}
          onChange={(event) => phone.field.onChange(formatPhone(event.target.value))}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <Field label="Пароль" htmlFor="register-password" error={errors.password?.message}>
          <Input
            id="register-password"
            type="password"
            autoComplete="new-password"
            aria-describedby="register-password-requirements"
            {...register('password')}
          />
        </Field>
        <PasswordRequirements password={password} />
      </div>

      {serverError && (
        <p role="alert" className="text-sm text-terracotta-600">
          {serverError}
        </p>
      )}

      <Button type="submit" loading={registerMutation.isPending}>
        Зарегистрироваться
      </Button>
    </form>
  )
}
