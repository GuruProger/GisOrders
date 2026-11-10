import type { ReactNode } from 'react'

/**
 * jsdom cannot run Leaflet: it needs real layout and browsers APIs. Component
 * tests replace `react-leaflet` (and the local cluster wrapper) with these
 * tiny stand-ins so only our own wiring is exercised.
 */
export interface MockMapClickEvent {
  latlng: { lat: number; lng: number }
}

type MapClickHandler = (event: MockMapClickEvent) => void

export const mapApi = {
  setView: vi.fn(),
  flyTo: vi.fn(),
  invalidateSize: vi.fn(),
  getContainer: () => document.body,
  click: null as MapClickHandler | null,
}

/** Drops handlers registered by the previous render. */
export function resetMapApi(): void {
  mapApi.setView.mockClear()
  mapApi.flyTo.mockClear()
  mapApi.invalidateSize.mockClear()
  mapApi.click = null
}

export interface MockMapProps {
  children?: ReactNode
  className?: string
}

export function MapContainer({ children, className }: MockMapProps) {
  return (
    <div data-testid="map-container" className={className}>
      {children}
    </div>
  )
}

export function TileLayer() {
  return null
}

export interface MockMarkerProps {
  title?: string
  eventHandlers?: { click?: () => void }
  children?: ReactNode
}

export function Marker({ title, eventHandlers, children }: MockMarkerProps) {
  return (
    <button type="button" aria-label={title} onClick={() => eventHandlers?.click?.()}>
      {children}
    </button>
  )
}

export function useMap() {
  return mapApi
}

export function useMapEvents(handlers: { click?: MapClickHandler } = {}) {
  mapApi.click = handlers.click ?? null
  return mapApi
}

export function MarkerClusterGroup({ children }: MockMapProps) {
  return <div data-testid="marker-cluster">{children}</div>
}
