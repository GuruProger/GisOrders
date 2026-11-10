import { useCallback, useEffect, useState } from 'react'
import type { Point } from '@/entities/order/lib/distance'
import { getJson, setJson, STORAGE_KEYS } from '@/shared/lib/storage'

function readStoredPoint(): Point | null {
  const stored = getJson<Point>(STORAGE_KEYS.point)
  if (!stored) return null
  if (!Number.isFinite(stored.lat) || !Number.isFinite(stored.lon)) return null
  return { lat: stored.lat, lon: stored.lon }
}

function geolocationAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.geolocation?.getCurrentPosition === 'function'
  )
}

/**
 * Asks the browser for a fresh point. Resolves `null` when geolocation is
 * missing, denied or times out; the caller decides whether to prompt again.
 */
export function requestGeolocation(): Promise<Point | null> {
  if (!geolocationAvailable()) return Promise.resolve(null)

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({ lat: position.coords.latitude, lon: position.coords.longitude })
      },
      () => resolve(null),
      { timeout: 8000, maximumAge: 60_000 },
    )
  })
}

/**
 * The point the feed searches around. It is read from `localStorage`
 * synchronously, so a previously chosen point is available on the very first
 * render. Without one we ask the browser once; a missing or denied geolocation
 * leaves the point `null` instead of inventing coordinates.
 */
export function useUserPoint(): [Point | null, (point: Point) => void] {
  const [point, setPointState] = useState<Point | null>(readStoredPoint)

  const setPoint = useCallback((next: Point) => {
    setJson(STORAGE_KEYS.point, next)
    setPointState(next)
  }, [])

  useEffect(() => {
    if (point !== null || !geolocationAvailable()) return

    let active = true
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!active) return
        setPoint({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        })
      },
      () => {
        // Denied or unavailable: the feed asks for a point in a later task.
      },
      { timeout: 8000, maximumAge: 60_000 },
    )

    return () => {
      active = false
    }
  }, [point, setPoint])

  return [point, setPoint]
}
