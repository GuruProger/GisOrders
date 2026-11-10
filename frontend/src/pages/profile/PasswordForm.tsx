import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useToast } from '@/app/providers'
import { ApiError } from '@/api/errors'
import { changePassword } from '@/features/auth/profile-api'
import { useSession } from '@/features/auth/session'
import { Button } from '@/shared/ui/Button'
import { Field } from '@/shared/ui/Field'
import { Input } from '@/shared/ui/Input'

interface PasswordRule {
  label: string
  message: string
  isValid: (password: string) => boolean
}

/**
 * Mirrors the backend password policy exactly: at least eight characters, one
 * uppercase letter (any script, Cyrillic included) and one digit. There is no
 * lowercase or special-character requirement.
 */
export const PASSWORD_RULES: PasswordRule[] = [
  {
    label: '8 символов',
    message: 'Пароль должен содержать минимум 8 символов',
    isValid: (password) => password.length >= 8,
  },
  {
    label: 'Заглавная буква',
    message: 'Пароль должен содержать хотя бы одну заглавную букву',
    isValid: (password) => /\p{Lu}/u.test(password),
  },
  {
    label: 'Цифра',
    message: 'Пароль должен содержать хотя бы одну цифру',
    isValid: (password) => /\d/.test(password),
  },
]

function passwordErrorMessage(error: unknown): string | null {
  if (!error) return null
  // Ruling P38 keeps the session alive, so this 401 is a validation error.
  if (error instanceof ApiError && error.code === 'invalid_password') {
    return 'Текущий пароль неверен'
  }
  // `parseError` already localizes HTTP failures; anything else (offline,
  // timeout) would surface an English browser message.
  if (error instanceof ApiError) return error.message
  return 'Не удалось изменить пароль'
}

/** Current/new password form; a successful change signs the user out. */
export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [currentError, setCurrentError] = useState<string | null>(null)
  const [newErrors, setNewErrors] = useState<string[]>([])
  const navigate = useNavigate()
  const toast = useToast()
  const clearSession = useSession((state) => state.clear)

  const mutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      toast.show('Пароль изменён. Войдите заново')
      clearSession()
      navigate('/login')
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()

    const violations = PASSWORD_RULES.filter((rule) => !rule.isValid(newPassword)).map(
      (rule) => rule.message,
    )
    setCurrentError(currentPassword ? null : 'Введите текущий пароль')
    setNewErrors(violations)
    if (!currentPassword || violations.length > 0) return

    mutation.mutate({ current_password: currentPassword, new_password: newPassword })
  }

  const serverError = passwordErrorMessage(mutation.error)

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
      <Field
        label="Текущий пароль"
        htmlFor="profile-current-password"
        error={currentError ?? undefined}
      >
        <Input
          id="profile-current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => {
            setCurrentPassword(event.target.value)
            setCurrentError(null)
            mutation.reset()
          }}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <Field label="Новый пароль" htmlFor="profile-new-password">
          <Input
            id="profile-new-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            aria-invalid={newErrors.length > 0 ? 'true' : undefined}
            aria-describedby="profile-password-hints"
            onChange={(event) => {
              setNewPassword(event.target.value)
              setNewErrors([])
              mutation.reset()
            }}
          />
        </Field>
        <ul
          id="profile-password-hints"
          aria-label="Требования к паролю"
          className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-strong"
        >
          {PASSWORD_RULES.map((rule) => (
            <li key={rule.label}>{rule.label}</li>
          ))}
        </ul>
        {newErrors.length > 0 && (
          <ul role="alert" className="flex flex-col gap-1 text-sm text-terracotta-600">
            {newErrors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        )}
      </div>

      {serverError && (
        <p role="alert" className="text-sm text-terracotta-600">
          {serverError}
        </p>
      )}

      <Button type="submit" loading={mutation.isPending}>
        Изменить пароль
      </Button>
    </form>
  )
}
