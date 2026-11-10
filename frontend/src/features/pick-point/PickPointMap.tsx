import { useState } from 'react'
import type { Point } from '@/entities/order/lib/distance'
import { STORAGE_KEYS, getJson } from '@/shared/lib/storage'
import { Button } from '@/shared/ui/Button'
import { MapView } from '@/widgets/map/MapView'

const FALLBACK_CENTER: Point = { lat: 55.7558, lon: 37.6173 }

export interface PickPointMapProps {
  point: Point | null
  onPick(point: Point): void
  disabled?: boolean
}

/** Map for choosing an order location: click sets the point, button uses GPS. */
export function PickPointMap({ point, onPick, disabled = false }: PickPointMapProps) {
  const [geoError, setGeoError] = useState<string | null>(null)
  const center = point ?? getJson<Point>(STORAGE_KEYS.point) ?? FALLBACK_CENTER

  function locate(): void {
    if (!('geolocation' in navigator)) {
      setGeoError('Геолокация недоступна в этом браузере. Поставьте точку кликом по карте.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGeoError(null)
        onPick({ lat: position.coords.latitude, lon: position.coords.longitude })
      },
      () => {
        setGeoError('Не удалось определить местоположение. Поставьте точку кликом по карте.')
      },
      { timeout: 10_000 },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="h-72 w-full overflow-hidden rounded-xl border border-line">
        <MapView
          markers={
            point
              ? [{ id: 0, lat: point.lat, lon: point.lon, price: null, label: 'Точка заказа' }]
              : []
          }
          center={center}
          onMapClick={disabled ? undefined : onPick}
          className="h-full"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={locate}
          disabled={disabled}
        >
          Моё местоположение
        </Button>
        {geoError && (
          <p role="alert" className="text-sm text-terracotta-600">
            {geoError}
          </p>
        )}
      </div>
    </div>
  )
}
