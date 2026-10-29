import { TREE_TYPES } from './trees'

test('lists the 21 tree types without duplicates', () => {
  expect(TREE_TYPES).toHaveLength(21)
  expect(new Set(TREE_TYPES).size).toBe(21)
})

test('keeps ё in display names', () => {
  expect(TREE_TYPES).toContain('берёза')
  expect(TREE_TYPES).toContain('черёмуха')
})
