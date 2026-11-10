import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from './Button'

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
  pending?: boolean
  error?: string | null
  onConfirm(): void
  onCancel(): void
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Confirmation dialog rendered with the `open` attribute instead of
 * `showModal()` (jsdom has no modal implementation). Escape and the backdrop
 * cancel, Tab is trapped inside, and focus returns to the trigger on close.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Отмена',
  tone = 'primary',
  pending = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const onCancelRef = useRef(onCancel)

  useEffect(() => {
    onCancelRef.current = onCancel
  }, [onCancel])

  useEffect(() => {
    if (!open) return

    const dialog = dialogRef.current
    const previouslyFocused = document.activeElement
    cancelRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancelRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-forest-900/40"
        onClick={() => onCancelRef.current()}
      />
      <dialog
        ref={dialogRef}
        open
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className={cn(
          'relative z-10 w-full max-w-sm rounded-2xl border border-line bg-card p-5 text-forest-900 shadow-xl',
        )}
      >
        <h2 id="confirm-dialog-title" className="text-lg font-semibold">
          {title}
        </h2>
        {description && <div className="mt-2 text-sm text-muted-strong">{description}</div>}
        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-terracotta-50 px-3 py-2 text-sm text-terracotta-600">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onCancelRef.current()}
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] px-4 font-medium text-moss-600 transition-colors hover:bg-sage-100 focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:outline-none"
          >
            {cancelLabel}
          </button>
          <Button
            variant={tone === 'danger' ? 'danger' : 'primary'}
            loading={pending}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </dialog>
    </div>
  )
}
