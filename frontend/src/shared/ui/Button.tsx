import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/shared/lib/cn'
import { Spinner } from './Spinner'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'md' | 'sm'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-moss-600 text-white hover:bg-leaf-500',
  secondary: 'bg-sage-100 text-moss-600',
  ghost: 'border border-line text-moss-600',
  danger: 'bg-terracotta-50 text-terracotta-600',
}

const sizeClasses: Record<ButtonSize, string> = {
  md: 'px-4 text-base',
  sm: 'px-3 text-sm',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 ring-leaf-500 disabled:pointer-events-none disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      aria-busy={loading ? 'true' : undefined}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}
