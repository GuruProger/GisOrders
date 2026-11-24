import { useQuery } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { fetchAvailableOrders } from '@/api/orders'
import { qk } from '@/api/queryKeys'
import type { FeedFilters } from '@/api/types'
import type { Point } from '@/entities/order/lib/distance'
import { DEFAULT_FILTERS, nextRadius, parseFilters, RADIUS_STEPS, toSearchParams } from '@/features/filters/model'
import { useRoleMode } from '@/features/switch-role/model'
import { requestGeolocation, useUserPoint } from '@/features/user-point/model'
import { plural } from '@/shared/lib/plural'
import { Button } from '@/shared/ui/Button'
import { OrderCard } from '@/widgets/order-card/OrderCard'
import { MapView } from '@/widgets/map/MapView'
import { buildMarkers, type MapMarker } from '@/widgets/map/markers'

const ORDER_FORMS: [string, string, string] = ['заказ', 'заказа', 'заказов']

/** Only used to place the map before a point has been picked. */
const FALLBACK_POINT: Point = { lat: 55.7558, lon: 37.6173 }

const NO_POINT_FILTERS: FeedFilters = { ...DEFAULT_FILTERS, ...FALLBACK_POINT }

/** Negative id, so the draft pin can never collide with a real order. */
const DRAFT_MARKER_ID = -1

const secondaryLinkClasses =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-sage-100 px-4 text-base font-medium text-moss-600 transition-colors hover:bg-mint-300 focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:outline-none'

/** Crosshair reused by the "my location" button. */
function LocateIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className="size-5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </svg>
  )
}

function savedHistoryIndex(): number {
  const state = window.history.state as { idx?: number } | null
  return state?.idx ?? 0
}

/** Full map screen: search around the stored point and browse found orders. */
export function MapPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [point, setPoint] = useUserPoint()
  const [mode] = useRoleMode()
  const [draft, setDraft] = useState<Point | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const [locating, setLocating] = useState(false)
  const [locateError, setLocateError] = useState<string | null>(null)
  const locatingRef = useRef(false)
  const cardRefs = useRef(new Map<number, HTMLDivElement>())
  const search = searchParams.toString()

  const filters = useMemo(() => (point ? parseFilters(search, point) : null), [point, search])

  const query = useQuery({
    queryKey: qk.orders.map(mode, filters ?? NO_POINT_FILTERS),
    queryFn: () => {
      if (!filters) throw new Error('Map requires a point')
      return fetchAvailableOrders(filters, 1)
    },
    enabled: filters !== null,
  })

  const orders = query.data?.orders ?? []
  const markers = useMemo<MapMarker[]>(() => {
    const orderMarkers = buildMarkers(query.data?.orders ?? [])
    if (filters !== null || draft === null) return orderMarkers
    return [
      ...orderMarkers,
      { id: DRAFT_MARKER_ID, lat: draft.lat, lon: draft.lon, price: null, label: 'Точка поиска' },
    ]
  }, [query.data, filters, draft])

  const center: Point = filters ?? draft ?? FALLBACK_POINT
  const total = query.data?.total ?? orders.length
  const countLabel = `${total} ${plural(total, ORDER_FORMS)}`

  function goBack(): void {
    if (savedHistoryIndex() > 0) navigate(-1)
    else navigate('/')
  }

  function selectMarker(id: number): void {
    setSelectedId(id)
    setHighlightId(id)
    const card = cardRefs.current.get(id)
    if (card && typeof card.scrollIntoView === 'function') {
      card.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
    }
  }

  function searchAroundDraft(): void {
    if (draft === null) return
    // Persisting the point re-derives the filters, and the new query key fetches.
    setPoint(draft)
    setDraft(null)
    setSelectedId(null)
    setHighlightId(null)
  }

  /**
   * Refreshes the search point from the browser. A denied or missing
   * geolocation only shows a short inline message: the map and the existing
   * point keep working.
   */
  async function locateMe(): Promise<void> {
    if (locatingRef.current) return
    locatingRef.current = true
    setLocating(true)
    setLocateError(null)

    try {
      const next = await requestGeolocation()
      if (next === null) {
        setLocateError('Геолокация недоступна')
        return
      }
      setPoint(next)
      setDraft(null)
      setSelectedId(null)
      setHighlightId(null)
    } catch {
      setLocateError('Геолокация недоступна')
    } finally {
      locatingRef.current = false
      setLocating(false)
    }
  }

  /** Same radius steps as the feed: the next value in `RADIUS_STEPS`. */
  function widenRadius(): void {
    if (!filters) return
    setSearchParams(toSearchParams({ ...filters, radiusKm: nextRadius(filters.radiusKm) }), {
      replace: true,
    })
  }

  return (
    <section className="relative">
      <div className="relative overflow-hidden rounded-xl border border-line bg-card">
        <MapView
          markers={markers}
          center={center}
          selectedId={selectedId}
          highlightId={highlightId}
          onSelect={selectMarker}
          onMapClick={filters === null ? setDraft : undefined}
          fitBounds
          className="map-screen h-[calc(100dvh-9.5rem-env(safe-area-inset-bottom))] min-h-96 lg:h-[calc(100dvh-11rem)]"
        />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-start gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={goBack}
              className="shadow-md"
            >
              Назад к списку
            </Button>
            <Button
              variant="secondary"
              size="sm"
              aria-label="Моё местоположение"
              title="Моё местоположение"
              className="min-w-11 px-2.5 shadow-md"
              loading={locating}
              onClick={() => void locateMe()}
            >
              {!locating && <LocateIcon />}
            </Button>
            {locateError && (
              <p
                role="alert"
                className="rounded-full bg-card px-3 py-2 text-sm font-medium text-terracotta-600 shadow-md"
              >
                {locateError}
              </p>
            )}
          </div>
          {filters !== null && !query.isLoading && !query.isError && (
            <div className="pointer-events-auto flex flex-wrap items-center gap-2 sm:justify-end">
              <p className="rounded-full bg-card px-3 py-2 text-sm font-medium text-muted-strong shadow-md">
                {countLabel}
              </p>
              {filters.radiusKm < Math.max(...RADIUS_STEPS) && (
                <Button variant="secondary" size="sm" className="shadow-md" onClick={widenRadius}>
                  Увеличить радиус
                </Button>
              )}
            </div>
          )}
        </div>

        {filters === null && (
          <div className="absolute inset-x-3 bottom-3 z-10 flex flex-col gap-2 rounded-xl border border-line bg-card p-4 shadow-lg">
            <p className="text-base font-semibold text-forest-900">Выберите точку на карте</p>
            <p className="text-sm text-muted-strong">
              Кликните по карте там, где искать заказы. Точку можно изменить в любой момент.
            </p>
            <Button className="self-start" disabled={draft === null} onClick={searchAroundDraft}>
              Искать здесь
            </Button>
          </div>
        )}

        {/* On mobile the header stacks (back + location, then the counter) and
            can gain an inline geolocation message, so status banners start
            below it. */}
        {query.isLoading && (
          <p className="absolute top-40 left-1/2 sm:top-20 z-10 -translate-x-1/2 rounded-full bg-card px-4 py-2 text-sm text-muted-strong shadow-md">
            Загружаем заказы…
          </p>
        )}

        {query.isError && (
          <div className="absolute top-40 left-1/2 sm:top-20 z-10 flex w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 flex-col items-center gap-2 rounded-xl border border-line bg-card p-4 text-center shadow-lg">
            <p className="text-base font-semibold text-forest-900">Не удалось загрузить заказы</p>
            <p className="text-sm text-muted-strong">Проверьте соединение и попробуйте ещё раз.</p>
            <Button size="sm" onClick={() => void query.refetch()}>
              Повторить
            </Button>
          </div>
        )}

        {filters !== null && !query.isLoading && !query.isError && orders.length === 0 && (
          <div className="absolute top-40 left-1/2 sm:top-20 z-10 flex w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 flex-col items-center gap-2 rounded-xl border border-line bg-card p-4 text-center shadow-lg">
            <p className="text-base font-semibold text-forest-900">
              В радиусе {filters.radiusKm} км заказов нет
            </p>
            <p className="text-sm text-muted-strong">
              Попробуйте сдвинуть точку поиска или увеличить радиус.
            </p>
            {mode === 'customer' && (
              <>
                <p className="text-sm text-muted-strong">
                  Карта показывает заказы других заказчиков. Свои заказы — в разделе «Мои
                  заказы».
                </p>
                <Link to="/my/orders" className={secondaryLinkClasses}>
                  Мои заказы
                </Link>
              </>
            )}
          </div>
        )}

        {orders.length > 0 && point !== null && (
          <div className="absolute inset-x-0 bottom-0 z-10 border-t border-line bg-card/95 p-3 backdrop-blur">
            <div
              role="list"
              aria-label="Найденные заказы"
              className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pt-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {orders.map((order) => (
                <div
                  key={order.id}
                  ref={(node) => {
                    if (node) cardRefs.current.set(order.id, node)
                    else cardRefs.current.delete(order.id)
                  }}
                  data-order-id={order.id}
                  className="w-72 shrink-0 snap-start"
                  onMouseEnter={() => setHighlightId(order.id)}
                  onFocus={() => setHighlightId(order.id)}
                  onMouseLeave={() => setHighlightId(null)}
                  onBlur={() => setHighlightId(null)}
                >
                  <OrderCard
                    order={order}
                    userPoint={point}
                    selected={selectedId === order.id || highlightId === order.id}
                    onClick={() => {
                      setSelectedId(order.id)
                      setHighlightId(order.id)
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
