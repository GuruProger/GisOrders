import L from 'leaflet'
import { useEffect } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import type { Point } from '@/entities/order/lib/distance'
import { cn } from '@/shared/lib/cn'
import { MarkerClusterGroup } from './MarkerClusterGroup'
import type { MapMarker } from './markers'

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const DEFAULT_ZOOM = 13
const FOCUS_ZOOM = 15

export interface MapViewProps {
  markers: MapMarker[]
  center: Point
  selectedId?: number | null
  onSelect?(id: number): void
  className?: string
  /** Enables point picking: called with the coordinates of a map click. */
  onMapClick?(point: Point): void
}

/** Price pill with a small stem, matching the feed's money formatting. */
function markerIcon(label: string, selected: boolean): L.DivIcon {
  const pill = [
    'inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border-2 border-white bg-moss-600 px-3 text-sm font-semibold leading-none text-white shadow-md',
    selected ? 'ring-2 ring-moss-600 ring-offset-2 ring-offset-white' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return L.divIcon({
    className: 'order-marker',
    html: `<span class="flex flex-col items-center"><span class="${pill}">${label}</span><span class="h-2 w-0.5 bg-moss-600"></span></span>`,
    iconSize: [140, 52],
    iconAnchor: [70, 52],
    popupAnchor: [0, -52],
  })
}

interface RecenterProps {
  center: Point
  selected: MapMarker | null
}

/** Keeps the viewport on the user point and follows the selected marker. */
function Recenter({ center, selected }: RecenterProps) {
  const map = useMap()
  const { lat, lon } = center
  const selectedId = selected?.id
  const selectedLat = selected?.lat
  const selectedLon = selected?.lon

  useEffect(() => {
    map.setView([lat, lon], DEFAULT_ZOOM)
  }, [map, lat, lon])

  useEffect(() => {
    if (selectedLat === undefined || selectedLon === undefined) return
    map.flyTo([selectedLat, selectedLon], FOCUS_ZOOM)
  }, [map, selectedId, selectedLat, selectedLon])

  return null
}

/** Leaflet keeps the size it saw on mount, so a hidden container stays broken until invalidated. */
function MapSizer() {
  const map = useMap()

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return

    const container = map.getContainer()
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(container)

    return () => observer.disconnect()
  }, [map])

  return null
}

/** Forwards background clicks when the page is picking a search point. */
export function MapEvents({ onClick }: { onClick(point: Point): void }) {
  useMapEvents({
    click(event) {
      onClick({ lat: event.latlng.lat, lon: event.latlng.lng })
    },
  })
  return null
}

/** Leaflet map with clustered price markers, reusable by the map screen and feed. */
export function MapView({
  markers,
  center,
  selectedId = null,
  onSelect,
  className,
  onMapClick,
}: MapViewProps) {
  const selected = markers.find((marker) => marker.id === selectedId) ?? null

  return (
    <MapContainer
      center={[center.lat, center.lon]}
      zoom={DEFAULT_ZOOM}
      scrollWheelZoom
      className={cn('relative z-0 w-full', className)}
    >
      <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />

      <Recenter center={center} selected={selected} />

      <MapSizer />

      {onMapClick && <MapEvents onClick={onMapClick} />}

      <MarkerClusterGroup>
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lon]}
            icon={markerIcon(marker.label, marker.id === selectedId)}
            title={marker.label}
            alt={marker.label}
            keyboard
            eventHandlers={{ click: () => onSelect?.(marker.id) }}
          />
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  )
}
