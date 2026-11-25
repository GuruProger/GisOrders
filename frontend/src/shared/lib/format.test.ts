import {
  formatChatTime,
  formatDeadline,
  formatMoney,
  formatShortDate,
  shortAddress,
} from './format'
import { plural } from './plural'

test('formats money with non-breaking spaces', () => {
  expect(formatMoney(2500)).toBe('2\u00A0500\u00A0₽')
  expect(formatMoney(0)).toBe('0\u00A0₽')
})

test('shortAddress keeps the first comma-separated segments', () => {
  expect(shortAddress('Москва, Тверская улица, 1')).toBe('Москва, Тверская улица')
  expect(shortAddress('Москва, Тверская улица, 1', 3)).toBe('Москва, Тверская улица, 1')
  expect(shortAddress('Тверская улица', 2)).toBe('Тверская улица')
  expect(shortAddress('  Москва ,  Тверская улица , 5 ')).toBe('Москва, Тверская улица')
})

test('plural picks the right russian form', () => {
  const forms: [string, string, string] = ['отклик', 'отклика', 'откликов']
  expect(plural(1, forms)).toBe('отклик')
  expect(plural(3, forms)).toBe('отклика')
  expect(plural(5, forms)).toBe('откликов')
  expect(plural(11, forms)).toBe('откликов')
  expect(plural(21, forms)).toBe('отклик')
})

test('chat time shows HH:mm today, «Вчера», then DD.MM', () => {
  const local = (y: number, m: number, d: number, h: number, min = 0) =>
    new Date(y, m - 1, d, h, min)
  const now = local(2026, 10, 28, 12, 0)
  expect(formatChatTime(local(2026, 10, 28, 9, 30).toISOString(), now)).toBe('09:30')
  expect(formatChatTime(local(2026, 10, 27, 23, 10).toISOString(), now)).toBe('Вчера')
  expect(formatChatTime(local(2026, 8, 10, 10, 0).toISOString(), now)).toBe('10.08')
})

test('deadline today is rendered with local time', () => {
  const local = (y: number, m: number, d: number, h: number, min = 0) =>
    new Date(y, m - 1, d, h, min)
  const now = local(2026, 10, 28, 9, 0)
  expect(formatDeadline(local(2026, 10, 28, 15, 0).toISOString(), now)).toBe('сегодня, 15:00')

  const tomorrow = local(2026, 10, 29, 9, 0)
  expect(formatDeadline(local(2026, 10, 30, 9, 0).toISOString(), tomorrow)).toBe('завтра, 09:00')
  expect(formatDeadline(local(2026, 12, 1, 10, 0).toISOString(), now)).toBe('1 дек')
  expect(formatShortDate(local(2026, 12, 1, 10, 0).toISOString())).toBe('1 дек')
})
