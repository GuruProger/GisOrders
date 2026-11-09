import { format, isSameDay, parse, subDays } from 'date-fns'
import { ru } from 'date-fns/locale'
import type { Message } from '@/api/types'

export interface MessageGroup {
  /** Local calendar day in `yyyy-MM-dd` form. */
  day: string
  messages: Message[]
}

function dayKey(iso: string): string {
  return format(new Date(iso), 'yyyy-MM-dd')
}

/**
 * Splits messages into day sections without reordering them: consecutive
 * messages of the same local day form one group, and the order inside a group
 * is the encounter order (the API returns messages oldest first).
 */
export function groupMessagesByDay(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = []

  for (const message of messages) {
    const day = dayKey(message.created_at)
    const current = groups[groups.length - 1]
    if (current && current.day === day) current.messages.push(message)
    else groups.push({ day, messages: [message] })
  }

  return groups
}

/** Separator label: «Сегодня», «Вчера» or `9 ноября`. */
export function formatDayLabel(day: string, now: Date = new Date()): string {
  const date = parse(day, 'yyyy-MM-dd', now)

  if (isSameDay(date, now)) return 'Сегодня'
  if (isSameDay(date, subDays(now, 1))) return 'Вчера'

  return format(date, 'd MMMM', { locale: ru })
}
