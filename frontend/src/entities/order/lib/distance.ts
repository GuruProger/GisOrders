export type Point = { lat: number; lon: number }

const EARTH_RADIUS_KM = 6371

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/** Great-circle distance in kilometers (haversine formula). */
export function distanceKm(a: Point, b: Point): number {
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const deltaLat = toRadians(b.lat - a.lat)
  const deltaLon = toRadians(b.lon - a.lon)

  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

/**
 * `0.85` → `850 м`, `1.24` → `1,2 км`, `12.4` → `12 км`.
 * Below one kilometer meters are rounded to the nearest ten.
 */
export function formatDistance(km: number): string {
  if (km < 1) return `${Math.round((km * 1000) / 10) * 10} м`
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} км`
  return `${Math.round(km)} км`
}
