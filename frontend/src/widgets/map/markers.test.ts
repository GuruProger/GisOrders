import { buildMarkers } from './markers'

test('builds one marker per order with price label', () => {
  const markers = buildMarkers([
    { id: 7, lat: 55.7, lon: 37.6, min_price: 2500, max_price: 4000 } as never,
  ])
  expect(markers).toEqual([
    { id: 7, lat: 55.7, lon: 37.6, price: 2500, label: '2\u00A0500\u00A0₽' },
  ])
})

test('order without price gets null price and dash label', () => {
  const markers = buildMarkers([
    { id: 8, lat: 55.7, lon: 37.6, min_price: null, max_price: null } as never,
  ])
  expect(markers[0]).toMatchObject({ price: null, label: '—' })
})
