import { distanceKm, formatDistance } from './distance'

test('distance between two nearby points', () => {
  const km = distanceKm({ lat: 55.7558, lon: 37.6173 }, { lat: 55.7658, lon: 37.6173 })
  expect(km).toBeCloseTo(1.11, 1)
})

test('formats meters and kilometers', () => {
  expect(formatDistance(0.85)).toBe('850 м')
  expect(formatDistance(0.04)).toBe('40 м')
  expect(formatDistance(1.24)).toBe('1,2 км')
  expect(formatDistance(12.4)).toBe('12 км')
})
