import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import type { FeedFilters, SortField, SortOrder } from '@/api/types'
import { TREE_TYPES } from '@/shared/config/trees'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { Field } from '@/shared/ui/Field'
import { Input } from '@/shared/ui/Input'
import { DEFAULT_FILTERS } from './model'

export interface FiltersSheetProps {
  open: boolean
  value: FeedFilters
  total: number | null
  onApply: (next: FeedFilters) => void
  onClose: () => void
}

const RADIUS_OPTIONS = [1, 5, 10, 25, 50] as const

const HEIGHT_OPTIONS: ReadonlyArray<{ label: string; value: number | null }> = [
  { label: 'Любая', value: null },
  { label: 'до 10 м', value: 10 },
  { label: 'до 20 м', value: 20 },
]

const SORT_FIELDS: ReadonlyArray<{ label: string; value: SortField }> = [
  { label: 'Новые', value: 'created_at' },
  { label: 'По сроку', value: 'deadline' },
  { label: 'По цене', value: 'min_price' },
]

const SORT_ORDERS: ReadonlyArray<{ label: string; value: SortOrder }> = [
  { label: 'Сначала новые', value: 'desc' },
  { label: 'Сначала старые', value: 'asc' },
]

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

/** Blank input means "no limit"; negatives are clamped to zero. */
function parseNonNegative(raw: string): number | null {
  if (raw.trim() === '') return null
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, parsed)
}

const selectClasses =
  'min-h-11 w-full rounded-[10px] border border-line bg-card px-3 text-base text-forest-900 focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:outline-none'

const chipClasses = (selected: boolean): string =>
  cn(
    'inline-flex min-h-11 items-center justify-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:outline-none',
    selected
      ? 'border-moss-600 bg-sage-100 text-moss-600'
      : 'border-line bg-card text-forest-900 hover:border-moss-600',
  )

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-forest-900">{title}</h3>
      {children}
    </section>
  )
}

interface OptionChipProps {
  selected: boolean
  onClick: () => void
  children: ReactNode
}

function OptionChip({ selected, onClick, children }: OptionChipProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={chipClasses(selected)}
    >
      {children}
    </button>
  )
}

/**
 * Feed filter sheet. The `<dialog>` is rendered with the `open` attribute
 * instead of `showModal()`: jsdom has no modal implementation, and the visual
 * result is the same with our fixed backdrop. Focus is trapped manually while
 * open and returned to the trigger on close.
 */
export function FiltersSheet({ open, value, total, onApply, onClose }: FiltersSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const onCloseRef = useRef(onClose)
  const [working, setWorking] = useState(value)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    setWorking(value)

    const dialog = dialogRef.current
    const previouslyFocused = document.activeElement
    if (!dialog) return
    const root: HTMLElement = dialog

    const initial = getFocusable(root)[0]
    initial?.focus()

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const items = getFocusable(root)
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return

      const active = document.activeElement
      const inside = active instanceof HTMLElement && root.contains(active)

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

  function update(patch: Partial<FeedFilters>): void {
    setWorking((current) => ({ ...current, ...patch }))
  }

  function setMinPrice(raw: string): void {
    const next = parseNonNegative(raw)
    setWorking((current) => {
      const max = current.maxPrice ?? null
      return {
        ...current,
        minPrice: next,
        maxPrice: next !== null && max !== null && max < next ? next : max,
      }
    })
  }

  function setMaxPrice(raw: string): void {
    const next = parseNonNegative(raw)
    setWorking((current) => {
      const min = current.minPrice ?? null
      return {
        ...current,
        maxPrice: next,
        minPrice: next !== null && min !== null && min > next ? next : min,
      }
    })
  }

  function handleReset(): void {
    const next: FeedFilters = {
      ...DEFAULT_FILTERS,
      lat: working.lat,
      lon: working.lon,
    }
    setWorking(next)
    onApply(next)
  }

  function handleApply(): void {
    onApply(working)
    onClose()
  }

  if (!open) return null

  const applyLabel = total === null ? 'Показать' : `Показать ${total}`

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center lg:items-center">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-forest-900/50"
      />

      <dialog
        ref={dialogRef}
        open={open}
        aria-modal="true"
        aria-labelledby="filters-sheet-title"
        className="relative z-50 m-0 max-h-[calc(100dvh-1rem)] w-full max-w-lg overflow-y-auto rounded-t-2xl border-0 bg-card p-0 text-forest-900 lg:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 id="filters-sheet-title" className="text-lg font-semibold text-forest-900">
            Фильтры
          </h2>
          <button
            type="button"
            aria-label="Закрыть фильтры"
            onClick={onClose}
            className="inline-flex size-11 items-center justify-center rounded-full text-muted-strong transition-colors hover:text-forest-900 focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:outline-none"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="size-5"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-6 px-4 py-4">
          <Section title="Где искать">
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                aria-pressed={working.lat === value.lat && working.lon === value.lon}
                onClick={() => update({ lat: value.lat, lon: value.lon })}
              >
                Моё местоположение
              </Button>
              <Link
                to="/map"
                className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-line px-4 text-base font-medium text-moss-600 transition-colors hover:border-moss-600 focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:outline-none"
              >
                Указать на карте
              </Link>
            </div>
          </Section>

          <Section title="Радиус поиска">
            <div role="radiogroup" aria-label="Радиус поиска" className="flex flex-wrap gap-2">
              {RADIUS_OPTIONS.map((radius) => (
                <OptionChip
                  key={radius}
                  selected={working.radiusKm === radius}
                  onClick={() => update({ radiusKm: radius })}
                >
                  {radius} км
                </OptionChip>
              ))}
            </div>
          </Section>

          <Section title="Цена">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Цена от" htmlFor="filters-min-price">
                <Input
                  id="filters-min-price"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={working.minPrice ?? ''}
                  onChange={(event) => setMinPrice(event.target.value)}
                />
              </Field>
              <Field label="Цена до" htmlFor="filters-max-price">
                <Input
                  id="filters-max-price"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={working.maxPrice ?? ''}
                  onChange={(event) => setMaxPrice(event.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section title="Порода">
            <div role="radiogroup" aria-label="Порода" className="flex flex-wrap gap-2">
              <OptionChip
                selected={working.treeType === null || working.treeType === undefined}
                onClick={() => update({ treeType: null })}
              >
                Любая
              </OptionChip>
              {TREE_TYPES.map((tree) => (
                <OptionChip
                  key={tree}
                  selected={working.treeType === tree}
                  onClick={() => update({ treeType: tree })}
                >
                  {tree}
                </OptionChip>
              ))}
            </div>
          </Section>

          <Section title="Высота дерева">
            <div role="radiogroup" aria-label="Высота" className="flex flex-wrap gap-2">
              {HEIGHT_OPTIONS.map((option) => (
                <OptionChip
                  key={option.label}
                  selected={(working.maxHeight ?? null) === option.value}
                  onClick={() => update({ maxHeight: option.value })}
                >
                  {option.label}
                </OptionChip>
              ))}
            </div>
          </Section>

          <Section title="Сортировка">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Сортировать" htmlFor="filters-sort-by">
                <select
                  id="filters-sort-by"
                  className={selectClasses}
                  value={working.sortBy}
                  onChange={(event) => update({ sortBy: event.target.value as SortField })}
                >
                  {SORT_FIELDS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Порядок" htmlFor="filters-sort-order">
                <select
                  id="filters-sort-order"
                  className={selectClasses}
                  value={working.sortOrder}
                  onChange={(event) => update({ sortOrder: event.target.value as SortOrder })}
                >
                  {SORT_ORDERS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>
        </div>

        <div className="sticky bottom-0 flex gap-2 border-t border-line bg-card px-4 py-3">
          <Button variant="ghost" onClick={handleReset}>
            Сбросить
          </Button>
          <Button className="flex-1" onClick={handleApply}>
            {applyLabel}
          </Button>
        </div>
      </dialog>
    </div>
  )
}
