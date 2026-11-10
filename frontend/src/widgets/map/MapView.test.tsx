import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { mapApi } from '@/test/mapMocks'
import { MapView } from './MapView'
import type { MapMarker } from './markers'

vi.mock('react-leaflet', () => import('@/test/mapMocks'))
vi.mock('./MarkerClusterGroup', () => import('@/test/mapMocks'))

const markers: MapMarker[] = [
  { id: 7, lat: 55.7, lon: 37.6, price: 2500, label: '2\u00A0500\u00A0₽' },
  { id: 8, lat: 55.8, lon: 37.7, price: null, label: '—' },
]

const center = { lat: 55.75, lon: 37.61 }

beforeEach(() => {
  mapApi.setView.mockClear()
  mapApi.flyTo.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('recalculates its size when the container resizes', () => {
  const trigger: { callback: (() => void) | null } = { callback: null }
  const observe = vi.fn()
  const disconnect = vi.fn()

  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        trigger.callback = callback
      }
      observe = observe
      disconnect = disconnect
    },
  )

  const { unmount } = render(<MapView markers={[]} center={center} />)

  expect(observe).toHaveBeenCalledWith(document.body)

  trigger.callback?.()
  expect(mapApi.invalidateSize).toHaveBeenCalled()

  unmount()
  expect(disconnect).toHaveBeenCalled()
})

test('renders one marker per entry and reports the clicked id', async () => {
  const onSelect = vi.fn()

  render(<MapView markers={markers} center={center} onSelect={onSelect} className="h-64" />)

  const buttons = screen.getAllByRole('button')
  expect(buttons).toHaveLength(markers.length)

  await userEvent.click(buttons[0]!)

  expect(onSelect).toHaveBeenCalledWith(7)
})

test('centers the map on the user point', () => {
  render(<MapView markers={[]} center={center} />)

  expect(mapApi.setView).toHaveBeenCalledWith([center.lat, center.lon], expect.any(Number))
})

test('flies to the selected marker', () => {
  render(<MapView markers={markers} center={center} selectedId={8} />)

  expect(mapApi.flyTo).toHaveBeenCalledWith([55.8, 37.7], expect.any(Number))
})

test('highlighting a marker does not move the viewport', () => {
  render(<MapView markers={markers} center={center} highlightId={8} />)

  expect(mapApi.flyTo).not.toHaveBeenCalled()
})
