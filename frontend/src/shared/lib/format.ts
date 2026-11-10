import { addDays, format, isSameDay } from 'date-fns'
import { ru } from 'date-fns/locale'

const NBSP = '\u00A0'

/** Intl versions may use thin/narrow no-break spaces; pin them to U+00A0. */
function normalizeNbsp(value: string): string {
  return value.replace(/[\u00A0\u202F\u2009]/g, NBSP)
}

/** `2500` → `2 500 ₽` with non-breaking spaces so the price never wraps. */
export function formatMoney(value: number): string {
  const amount = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)
  return `${normalizeNbsp(amount)}${NBSP}₽`
}

/** `2026-10-28T...` → `28 окт` (date-fns ru prints a trailing dot). */
export function formatShortDate(iso: string): string {
  return format(new Date(iso), 'd MMM', { locale: ru }).replace(/\.$/, '')
}

/**
 * Local-calendar deadline label: `сегодня, 18:00`, `завтра, 09:00`, `12 ноя`.
 * `now` is injectable so tests and callers can pin the reference day.
 */
export function formatDeadline(iso: string, now: Date = new Date()): string {
  const date = new Date(iso)
  const time = format(date, 'HH:mm')

  if (isSameDay(date, now)) return `сегодня, ${time}`
  if (isSameDay(date, addDays(now, 1))) return `завтра, ${time}`

  return formatShortDate(iso)
}
