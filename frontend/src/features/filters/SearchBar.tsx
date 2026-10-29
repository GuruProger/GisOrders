import { useEffect, useRef, useState } from 'react'
import { Input } from '@/shared/ui/Input'

/** The backend search ships with this release, so the flag defaults to on. */
const SEARCH_ENABLED = import.meta.env.VITE_FEATURE_SEARCH !== 'false'
const DEBOUNCE_MS = 350

export interface SearchBarProps {
  value: string
  onChange: (q: string) => void
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m16 16 4 4" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-4"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  )
}

/**
 * Debounced feed search. The input keeps its own draft so typing stays
 * responsive; a changed `value` (chip reset, back navigation) wins over the
 * draft without emitting the same value again.
 */
export function SearchBar({ value, onChange }: SearchBarProps) {
  const [text, setText] = useState(value)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    setText(value)
  }, [value])

  useEffect(() => {
    if (text === value) return
    const timer = setTimeout(() => onChangeRef.current(text), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text, value])

  if (!SEARCH_ENABLED) return null

  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
      >
        <SearchIcon />
      </span>

      <Input
        type="search"
        aria-label="Поиск заказов"
        placeholder="Найти заказ"
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="pl-10 pr-12 [&::-webkit-search-cancel-button]:hidden"
      />

      {text !== '' && (
        <button
          type="button"
          aria-label="Очистить поиск"
          onClick={() => setText('')}
          className="absolute top-1/2 right-1 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted-strong transition-colors hover:text-forest-900 focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:outline-none"
        >
          <ClearIcon />
        </button>
      )}
    </div>
  )
}
