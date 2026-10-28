import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

type FieldChildProps = {
  'aria-describedby'?: string
  'aria-invalid'?: 'true' | 'false'
}

export type FieldProps = {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children?: ReactNode
  className?: string
}

export function Field({ label, htmlFor, error, hint, children, className }: FieldProps) {
  const errorId = error ? `${htmlFor}-error` : undefined
  const hintId = hint ? `${htmlFor}-hint` : undefined

  let child = children
  if (isValidElement<FieldChildProps>(children)) {
    const existing = children.props['aria-describedby']
    const describedBy = [existing, hintId, errorId].filter(Boolean).join(' ')
    child = cloneElement(children as ReactElement<FieldChildProps>, {
      ...(describedBy ? { 'aria-describedby': describedBy } : {}),
      ...(error ? { 'aria-invalid': 'true' as const } : {}),
    })
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-forest-900">
        {label}
      </label>
      {child}
      {hint && (
        <p id={hintId} className="text-sm text-muted-strong">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-terracotta-600">
          {error}
        </p>
      )}
    </div>
  )
}
