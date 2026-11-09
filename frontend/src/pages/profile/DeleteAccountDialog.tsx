import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useToast } from '@/app/providers'
import { mutationErrorMessage } from '@/features/auth/api'
import { deleteAccount } from '@/features/auth/profile-api'
import { useSession } from '@/features/auth/session'
import { Button } from '@/shared/ui/Button'
import { Field } from '@/shared/ui/Field'
import { Input } from '@/shared/ui/Input'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const CONFIRMATION_WORD = 'удалить'

export interface DeleteAccountDialogProps {
  open: boolean
  onClose(): void
}

/**
 * Irreversible account deletion. Like `ConfirmDialog` this uses the `open`
 * attribute instead of `showModal()` (jsdom has no modal implementation), but
 * adds a typed confirmation gate: the destructive button stays disabled until
 * the user types «удалить» (case-insensitive, surrounding spaces ignored).
 */
export function DeleteAccountDialog({ open, onClose }: DeleteAccountDialogProps) {
  const [confirmation, setConfirmation] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const onCloseRef = useRef(onClose)
  const pendingRef = useRef(false)
  const navigate = useNavigate()
  const toast = useToast()
  const clearSession = useSession((state) => state.clear)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  const mutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      toast.show('Аккаунт удалён')
      clearSession()
      navigate('/login')
    },
  })

  pendingRef.current = mutation.isPending

  // A fresh dialog starts without the previous attempt's word or error.
  useEffect(() => {
    if (!open) return
    setConfirmation('')
    mutation.reset()
    // Reset only when the dialog opens; `mutation` changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return

    const previouslyFocused = document.activeElement

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!pendingRef.current) onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const dialog = dialogRef.current
      if (!dialog) return
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return

      const active = document.activeElement
      const inside = active instanceof HTMLElement && dialog.contains(active)

      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [open])

  if (!open) return null

  const confirmed = confirmation.trim().toLowerCase() === CONFIRMATION_WORD
  const error = mutationErrorMessage(mutation.error, 'Не удалось удалить аккаунт')

  function cancel(): void {
    if (mutation.isPending) return
    onCloseRef.current()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-forest-900/40"
        onClick={cancel}
      />
      <dialog
        ref={dialogRef}
        open
        aria-modal="true"
        aria-labelledby="delete-account-title"
        className="relative z-10 w-full max-w-sm rounded-2xl border border-line bg-card p-5 text-forest-900 shadow-xl"
      >
        <h2 id="delete-account-title" className="text-lg font-semibold">
          Удаление аккаунта
        </h2>
        <p className="mt-2 text-sm text-muted-strong">
          Действие необратимо. Вместе с аккаунтом будут удалены ваши заказы, отклики и чаты.
        </p>

        <Field
          label="Введите «удалить»"
          htmlFor="delete-account-confirmation"
          hint="Без учёта регистра"
          className="mt-4"
        >
          <Input
            id="delete-account-confirmation"
            autoFocus
            autoComplete="off"
            value={confirmation}
            onChange={(event) => {
              setConfirmation(event.target.value)
              mutation.reset()
            }}
          />
        </Field>

        {error && (
          <p
            role="alert"
            className="mt-3 rounded-lg bg-terracotta-50 px-3 py-2 text-sm text-terracotta-600"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={cancel}
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] px-4 font-medium text-moss-600 transition-colors hover:bg-sage-100 focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:outline-none"
          >
            Отмена
          </button>
          <Button
            variant="danger"
            disabled={!confirmed}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Удалить навсегда
          </Button>
        </div>
      </dialog>
    </div>
  )
}
