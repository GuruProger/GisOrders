import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/shared/lib/cn'
import { useRoleMode, type RoleMode } from './model'

interface RoleOption {
  value: RoleMode
  label: string
  shortLabel: string
}

const options: RoleOption[] = [
  { value: 'customer', label: 'Заказчик', shortLabel: 'З' },
  { value: 'executor', label: 'Исполнитель', shortLabel: 'И' },
]

/**
 * Two-state control for the UI role. On very narrow screens the visible text
 * collapses to initials, while the accessible name always stays complete.
 */
export function RoleSwitch() {
  const [mode, setMode] = useRoleMode()
  const buttons = useRef<Record<RoleMode, HTMLButtonElement | null>>({
    customer: null,
    executor: null,
  })

  function select(next: RoleMode): void {
    setMode(next)
    buttons.current[next]?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, value: RoleMode): void {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      select(value === 'customer' ? 'executor' : 'customer')
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      select(value === 'customer' ? 'executor' : 'customer')
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label="Режим работы"
      className="inline-flex items-center gap-0.5 rounded-full bg-sage-100 p-0.5"
    >
      {options.map((option) => {
        const checked = option.value === mode

        return (
          <button
            key={option.value}
            ref={(node) => {
              buttons.current[option.value] = node
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.label}
            tabIndex={checked ? 0 : -1}
            onClick={() => setMode(option.value)}
            onKeyDown={(event) => handleKeyDown(event, option.value)}
            className={cn(
              'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500',
              checked ? 'bg-card text-moss-600 shadow-sm' : 'text-muted-strong hover:text-moss-600',
            )}
          >
            <span className="max-[399px]:hidden">{option.label}</span>
            <span aria-hidden="true" className="hidden max-[399px]:inline">
              {option.shortLabel}
            </span>
          </button>
        )
      })}
    </div>
  )
}
