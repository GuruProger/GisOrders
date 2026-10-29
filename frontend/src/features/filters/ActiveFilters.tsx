import type { FeedFilters } from '@/api/types'
import { DEFAULT_FILTERS } from './model'

export interface ActiveFiltersProps {
  value: FeedFilters
  onChange: (next: FeedFilters) => void
}

interface Chip {
  key: string
  label: string
  ariaLabel: string
  clear: (filters: FeedFilters) => FeedFilters
}

const SORT_BY_LABELS: Record<FeedFilters['sortBy'], string> = {
  created_at: 'Новые',
  deadline: 'По сроку',
  min_price: 'По цене',
}

const SORT_ORDER_LABELS: Record<FeedFilters['sortOrder'], string> = {
  desc: 'Сначала новые',
  asc: 'Сначала старые',
}

/** Non-search chips in a stable order; the point is never treated as a filter. */
function filterChips(value: FeedFilters): Chip[] {
  const chips: Chip[] = []

  if (value.radiusKm !== DEFAULT_FILTERS.radiusKm) {
    chips.push({
      key: 'radius',
      label: `Радиус: ${value.radiusKm} км`,
      ariaLabel: 'Убрать фильтр Радиус',
      clear: (filters) => ({ ...filters, radiusKm: DEFAULT_FILTERS.radiusKm }),
    })
  }

  if (value.minPrice !== null && value.minPrice !== undefined) {
    chips.push({
      key: 'min',
      label: `Цена от: ${value.minPrice} ₽`,
      ariaLabel: 'Убрать фильтр Цена от',
      clear: (filters) => ({ ...filters, minPrice: null }),
    })
  }

  if (value.maxPrice !== null && value.maxPrice !== undefined) {
    chips.push({
      key: 'max',
      label: `Цена до: ${value.maxPrice} ₽`,
      ariaLabel: 'Убрать фильтр Цена до',
      clear: (filters) => ({ ...filters, maxPrice: null }),
    })
  }

  if (value.treeType) {
    chips.push({
      key: 'tree',
      label: value.treeType,
      ariaLabel: 'Убрать фильтр Порода',
      clear: (filters) => ({ ...filters, treeType: null }),
    })
  }

  if (value.maxHeight !== null && value.maxHeight !== undefined) {
    chips.push({
      key: 'height',
      label: `Высота: до ${value.maxHeight} м`,
      ariaLabel: 'Убрать фильтр Высота',
      clear: (filters) => ({ ...filters, maxHeight: null }),
    })
  }

  if (
    value.sortBy !== DEFAULT_FILTERS.sortBy ||
    value.sortOrder !== DEFAULT_FILTERS.sortOrder
  ) {
    const parts: string[] = []
    if (value.sortBy !== DEFAULT_FILTERS.sortBy) parts.push(SORT_BY_LABELS[value.sortBy])
    if (value.sortOrder !== DEFAULT_FILTERS.sortOrder) {
      parts.push(SORT_ORDER_LABELS[value.sortOrder])
    }

    chips.push({
      key: 'sort',
      label: `Сортировка: ${parts.join(' · ')}`,
      ariaLabel: 'Убрать фильтр Сортировка',
      clear: (filters) => ({
        ...filters,
        sortBy: DEFAULT_FILTERS.sortBy,
        sortOrder: DEFAULT_FILTERS.sortOrder,
      }),
    })
  }

  return chips
}

/** Number of filters (not counting search) shown on the toolbar button. */
export function countActiveFilters(value: FeedFilters): number {
  return filterChips(value).length
}

/** Removable chips for every filter that differs from the defaults. */
export function ActiveFilters({ value, onChange }: ActiveFiltersProps) {
  const search = value.q.trim()
  const chips: Chip[] = [
    ...(search === ''
      ? []
      : [
          {
            key: 'q',
            label: `Поиск: ${search}`,
            ariaLabel: 'Убрать фильтр Поиск',
            clear: (filters: FeedFilters) => ({ ...filters, q: '' }),
          },
        ]),
    ...filterChips(value),
  ]

  if (chips.length === 0) return null

  return (
    <div role="group" aria-label="Активные фильтры" className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex min-h-11 items-center rounded-full border border-line bg-card pr-1 pl-3 text-sm text-forest-900"
        >
          <span className="max-w-56 truncate">{chip.label}</span>
          <button
            type="button"
            aria-label={chip.ariaLabel}
            onClick={() => onChange(chip.clear(value))}
            className="ml-1 inline-flex size-11 items-center justify-center rounded-full text-muted-strong transition-colors hover:text-forest-900 focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:outline-none"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="size-4"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </span>
      ))}
    </div>
  )
}
