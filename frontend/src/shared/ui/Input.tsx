import type { InputHTMLAttributes } from 'react'
import { cn } from '@/shared/lib/cn'

export type InputProps = InputHTMLAttributes<HTMLInputElement>

export function Input({ className, type = 'text', ...rest }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        'min-h-11 w-full rounded-[10px] border border-line bg-card px-3 text-base text-forest-900 placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 aria-invalid:border-terracotta-600',
        className,
      )}
      {...rest}
    />
  )
}
