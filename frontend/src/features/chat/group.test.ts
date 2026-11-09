import type { Message } from '@/api/types'
import { formatDayLabel, groupMessagesByDay } from './group'

function message(id: number, createdAt: string): Message {
  return {
    id,
    chat_id: 1,
    sender_id: 2,
    text: `Сообщение ${id}`,
    is_read: false,
    created_at: createdAt,
  }
}

test('messages from different days become separate groups', () => {
  const messages = [
    message(1, '2026-11-09T09:00:00'),
    message(2, '2026-11-09T10:00:00'),
    message(3, '2026-11-10T08:30:00'),
  ]

  const groups = groupMessagesByDay(messages)

  expect(groups.map((group) => group.day)).toEqual(['2026-11-09', '2026-11-10'])
  expect(groups.map((group) => group.messages.map((item) => item.id))).toEqual([[1, 2], [3]])
})

test('keeps the encounter order inside a day', () => {
  const messages = [
    message(10, '2026-11-09T18:00:00'),
    message(7, '2026-11-09T09:00:00'),
    message(12, '2026-11-09T20:00:00'),
  ]

  const [group] = groupMessagesByDay(messages)

  expect(group?.messages.map((item) => item.id)).toEqual([10, 7, 12])
})

test('does not merge two runs of the same day that are not adjacent', () => {
  const messages = [
    message(1, '2026-11-09T09:00:00'),
    message(2, '2026-11-10T09:00:00'),
    message(3, '2026-11-09T10:00:00'),
  ]

  const groups = groupMessagesByDay(messages)

  expect(groups.map((group) => group.day)).toEqual(['2026-11-09', '2026-11-10', '2026-11-09'])
})

test('labels today, yesterday and other days in Russian', () => {
  const now = new Date('2026-11-09T12:00:00')

  expect(formatDayLabel('2026-11-09', now)).toBe('Сегодня')
  expect(formatDayLabel('2026-11-08', now)).toBe('Вчера')
  expect(formatDayLabel('2026-11-05', now)).toBe('5 ноября')
})
