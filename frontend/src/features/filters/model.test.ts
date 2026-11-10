import { DEFAULT_FILTERS, parseFilters, toSearchParams } from './model'

const point = { lat: 55.75, lon: 37.61 }

test('defaults when url is empty', () => {
  expect(parseFilters('', point)).toEqual({ ...DEFAULT_FILTERS, lat: 55.75, lon: 37.61 })
})

test('round-trips all filters', () => {
  const filters = {
    q: 'спил',
    radiusKm: 25,
    minPrice: 1000,
    maxPrice: 5000,
    treeType: 'сосна',
    maxHeight: 20,
    sortBy: 'min_price' as const,
    sortOrder: 'asc' as const,
    lat: 55.75,
    lon: 37.61,
  }
  expect(parseFilters(`?${toSearchParams(filters)}`, point)).toEqual(filters)
})

test('invalid values fall back to defaults', () => {
  const parsed = parseFilters('?radius=999&sort=unknown&min=x', point)
  expect(parsed.radiusKm).toBe(10)
  expect(parsed.sortBy).toBe('created_at')
  expect(parsed.minPrice).toBeNull()
})

test('blank search is dropped', () => {
  expect(toSearchParams({ ...DEFAULT_FILTERS, q: '   ', lat: 1, lon: 2 }).has('q')).toBe(false)
})

test('min greater than max drops max', () => {
  const parsed = parseFilters('?min=5000&max=1000', point)
  expect(parsed.minPrice).toBe(5000)
  expect(parsed.maxPrice).toBeNull()
})

test('short url keys are used in the address bar', () => {
  const params = toSearchParams({
    ...DEFAULT_FILTERS,
    radiusKm: 25,
    minPrice: 100,
    maxPrice: 200,
    treeType: 'сосна',
    maxHeight: 20,
    sortBy: 'deadline',
    sortOrder: 'asc',
    lat: 55.75,
    lon: 37.61,
  })

  expect(params.get('radius')).toBe('25')
  expect(params.get('min')).toBe('100')
  expect(params.get('max')).toBe('200')
  expect(params.get('tree')).toBe('сосна')
  expect(params.get('height')).toBe('20')
  expect(params.get('sort')).toBe('deadline')
  expect(params.get('order')).toBe('asc')
  expect(params.has('lat')).toBe(false)
  expect(params.has('lon')).toBe(false)
})
