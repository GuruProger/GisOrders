import { returnPath } from './returnPath'

test('preserves pathname, query string and hash', () => {
  expect(
    returnPath({
      from: { pathname: '/orders', search: '?page=2&sort=deadline', hash: '#top' },
    }),
  ).toBe('/orders?page=2&sort=deadline#top')
})

test('returns the fallback when state has no destination', () => {
  expect(returnPath(null)).toBe('/')
  expect(returnPath({})).toBe('/')
  expect(returnPath({ from: { pathname: 'orders' } })).toBe('/')
})

test('drops malformed query and hash parts', () => {
  expect(returnPath({ from: { pathname: '/profile', search: 'page=2', hash: 'top' } })).toBe(
    '/profile',
  )
})
