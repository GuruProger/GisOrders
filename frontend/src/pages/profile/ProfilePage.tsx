import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router'
import { z } from 'zod'
import { useToast } from '@/app/providers'
import { qk } from '@/api/queryKeys'
import type { User } from '@/api/types'
import { logout, mutationErrorMessage } from '@/features/auth/api'
import { fetchMe, normalizePhone, updateProfile } from '@/features/auth/profile-api'
import { useSession } from '@/features/auth/session'
import { RoleSwitch } from '@/features/switch-role/RoleSwitch'
import { useDocumentTitle } from '@/shared/lib/use-document-title'
import { zodResolver } from '@/shared/lib/zodResolver'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Field } from '@/shared/ui/Field'
import { Input } from '@/shared/ui/Input'
import { Skeleton } from '@/shared/ui/Skeleton'
import { DeleteAccountDialog } from './DeleteAccountDialog'
import { PasswordForm } from './PasswordForm'

const profileSchema = z.object({
  username: z.string().trim().min(1, 'Укажите имя').max(50, 'Не более 50 символов'),
  phone: z
    .string()
    .refine(
      (value) => value.trim() === '' || normalizePhone(value) !== null,
      'Введите номер в формате +7XXXXXXXXXX',
    ),
})

type ProfileValues = z.infer<typeof profileSchema>

function ProfileForm({ user }: { user: User }) {
  const queryClient = useQueryClient()
  const setUser = useSession((state) => state.setUser)
  const toast = useToast()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { username: user.username, phone: user.phone_number ?? '' },
  })

  // Keep the form in sync when another part of the app refreshes the profile.
  useEffect(() => {
    reset({ username: user.username, phone: user.phone_number ?? '' })
  }, [user.username, user.phone_number, reset])

  const mutation = useMutation({
    mutationFn: (values: ProfileValues) =>
      updateProfile({
        username: values.username.trim(),
        phone_number: normalizePhone(values.phone),
      }),
    onSuccess: (updated) => {
      setUser(updated)
      // Ruling P40: no separate "me" key; refresh the shared user detail so
      // the header and any executor labels that embed the name update.
      void queryClient.invalidateQueries({ queryKey: qk.users.detail(updated.id) })
      toast.show('Профиль обновлён')
    },
  })

  const serverError = mutationErrorMessage(mutation.error, 'Не удалось сохранить профиль')

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
    >
      <Field label="Имя" htmlFor="profile-username" error={errors.username?.message}>
        <Input
          id="profile-username"
          type="text"
          autoComplete="username"
          {...register('username')}
        />
      </Field>

      <Field
        label="Телефон"
        htmlFor="profile-phone"
        hint="Формат: +7XXXXXXXXXX"
        error={errors.phone?.message}
      >
        <Input
          id="profile-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+7XXXXXXXXXX"
          {...register('phone')}
        />
      </Field>

      {serverError && (
        <p role="alert" className="text-sm text-terracotta-600">
          {serverError}
        </p>
      )}

      <Button type="submit" loading={mutation.isPending}>
        Сохранить
      </Button>
    </form>
  )
}

function ProfileSkeleton() {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-56 w-full" />
    </section>
  )
}

/** `/profile`: user card, editable name/phone, role mode, security and danger zone. */
export function ProfilePage() {
  const user = useSession((state) => state.user)
  const status = useSession((state) => state.status)
  const setUser = useSession((state) => state.setUser)
  const navigate = useNavigate()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [loadingMe, setLoadingMe] = useState(
    status === 'authenticated' && user === null,
  )
  const [loggingOut, setLoggingOut] = useState(false)

  useDocumentTitle('Профиль — GisOrders')

  // A session restored while offline keeps `status: 'authenticated'` without
  // profile data (see `restoreSession`). Fetch it once instead of crashing on
  // `user.username`; the retry button increments `attempt`.
  useEffect(() => {
    if (status !== 'authenticated' || user !== null) return

    let active = true
    setLoadingMe(true)
    fetchMe()
      .then((data) => {
        if (!active) return
        setUser(data)
        setLoadingMe(false)
      })
      .catch(() => {
        if (!active) return
        setLoadingMe(false)
      })

    return () => {
      active = false
    }
  }, [status, user, attempt, setUser])

  async function handleLogout(): Promise<void> {
    setLoggingOut(true)
    try {
      await logout()
    } finally {
      setLoggingOut(false)
      navigate('/login')
    }
  }

  if (!user) {
    if (status === 'loading' || loadingMe) return <ProfileSkeleton />

    return (
      <EmptyState
        title="Не удалось загрузить профиль"
        description="Проверьте соединение и попробуйте ещё раз."
        action={
          status === 'authenticated' ? (
            <Button onClick={() => setAttempt((value) => value + 1)}>Повторить</Button>
          ) : (
            <Button onClick={() => navigate('/login')}>Войти</Button>
          )
        }
      />
    )
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-6">
      <h1 className="text-2xl font-semibold text-forest-900">Профиль</h1>

      <Card className="flex items-center gap-3 p-4">
        <Avatar name={user.username} className="size-12 text-lg" />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-forest-900">{user.username}</p>
          <p className="truncate text-sm text-muted-strong">{user.email}</p>
          <p className="truncate text-sm text-muted-strong">
            {user.phone_number ?? 'Не указан'}
          </p>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-lg font-semibold text-forest-900">Личные данные</h2>
        <ProfileForm user={user} />
      </Card>

      <Card className="flex flex-col gap-2 p-4">
        <h2 className="text-lg font-semibold text-forest-900">Режим работы</h2>
        <RoleSwitch />
        <p className="text-sm text-muted-strong">
          Один аккаунт — обе роли. Переключатель меняет только интерфейс.
        </p>
      </Card>

      <Card className="p-4">
        <h2 className="mb-3 text-lg font-semibold text-forest-900">Безопасность</h2>
        <PasswordForm />
      </Card>

      <div>
        <Button variant="ghost" onClick={() => void handleLogout()} loading={loggingOut}>
          Выйти
        </Button>
      </div>

      <Card className="flex flex-col items-start gap-3 border-terracotta-600 p-4">
        <h2 className="text-lg font-semibold text-forest-900">Удаление аккаунта</h2>
        <p className="text-sm text-muted-strong">
          Аккаунт удаляется без возможности восстановления вместе с заказами, откликами и чатами.
        </p>
        <Button variant="danger" onClick={() => setDeleteOpen(true)}>
          Удалить аккаунт
        </Button>
      </Card>

      <DeleteAccountDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </section>
  )
}
