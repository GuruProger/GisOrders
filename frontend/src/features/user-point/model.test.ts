import { act, renderHook } from '@testing-library/react'
import { STORAGE_KEYS } from '@/shared/lib/storage'
import { useUserPoint } from './model'

function stubGeolocation(getCurrentPosition: Geolocation['getCurrentPosition']): void {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  })
}

afterEach(() => {
  localStorage.clear()
  Reflect.deleteProperty(navigator, 'geolocation')
})

test('reads the stored point synchronously and does not ask geolocation', () => {
  localStorage.setItem(STORAGE_KEYS.point, JSON.stringify({ lat: 1, lon: 2 }))
  const getCurrentPosition = vi.fn()
  stubGeolocation(getCurrentPosition as unknown as Geolocation['getCurrentPosition'])

  const { result } = renderHook(() => useUserPoint())

  expect(result.current[0]).toEqual({ lat: 1, lon: 2 })
  expect(getCurrentPosition).not.toHaveBeenCalled()
})

test('asks geolocation once and persists the resolved point', () => {
  let onSuccess: PositionCallback | undefined
  const getCurrentPosition = vi.fn((success: PositionCallback) => {
    onSuccess = success
  })
  stubGeolocation(getCurrentPosition as unknown as Geolocation['getCurrentPosition'])

  const { result } = renderHook(() => useUserPoint())
  expect(result.current[0]).toBeNull()

  act(() => {
    onSuccess?.({
      coords: {
        latitude: 55.7,
        longitude: 37.6,
        accuracy: 5,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    } as unknown as GeolocationPosition)
  })

  expect(result.current[0]).toEqual({ lat: 55.7, lon: 37.6 })
  expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.point) ?? 'null')).toEqual({
    lat: 55.7,
    lon: 37.6,
  })
  expect(getCurrentPosition).toHaveBeenCalledTimes(1)
})

test('keeps the point empty when geolocation fails', () => {
  let onError: PositionErrorCallback | undefined
  const getCurrentPosition = vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
    onError = error
  })
  stubGeolocation(getCurrentPosition as unknown as Geolocation['getCurrentPosition'])

  const { result } = renderHook(() => useUserPoint())

  act(() => {
    onError?.({
      code: 1,
      message: 'denied',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    })
  })

  expect(result.current[0]).toBeNull()
  expect(localStorage.getItem(STORAGE_KEYS.point)).toBeNull()
})
