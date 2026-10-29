import { formatDeadline, formatMoney, formatShortDate } from './format'
import { plural } from './plural'

test('formats money with non-breaking spaces', () => {
  expect(formatMoney(2500)).toBe('2\u00A0500\u00A0₽')
  expect(formatMoney(0)).toBe('0\u00A0₽')
})

test('plural picks the right russian form', () => {
  const forms: [string, string, string] = ['отклик', 'отклика', 'откликов']
  expect(plural(1, forms)).toBe('отклик')
  expect(plural(3, forms)).toBe('отклика')
  expect(plural(5, forms)).toBe('откликов')
  expect(plural(11, forms)).toBe('откликов')
  expect(plural(21, forms)).toBe('отклик')
})

test('deadline today is rendered with local time', () => {
  const now = new Date('2026-10-28T09:00:00+03:00')
  expect(formatDeadline('2026-10-28T15:00:00Z', now)).toBe('сегодня, 18:00')

  const tomorrow = new Date('2026-10-29T09:00:00+03:00')
  expect(formatDeadline('2026-10-30T06:00:00Z', tomorrow)).toBe('завтра, 09:00')
  expect(formatDeadline('2026-12-01T10:00:00Z', now)).toBe('1 дек')
  expect(formatShortDate('2026-12-01T10:00:00Z')).toBe('1 дек')
})
