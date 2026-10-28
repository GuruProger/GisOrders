import type { TextareaHTMLAttributes } from 'react'
import { cn } from '@/shared/lib/cn'

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export function Textarea({ className, rows = 4, ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      className={cn(
        'min-h-11 w-full rounded-[10px] border border-line bg-card px-3 py-2 text-base text-forest-900 placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 aria-invalid:border-terracotta-600',
        className,
      )}
      {...rest}
    />
  )
}
