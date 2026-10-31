import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { fetchAvailableOrders, FEED_PAGE_SIZE } from '@/api/orders'
import { qk } from '@/api/queryKeys'
import type { FeedFilters } from '@/api/types'
import { ActiveFilters, countActiveFilters } from '@/features/filters/ActiveFilters'
import { FiltersSheet } from '@/features/filters/FiltersSheet'
import { DEFAULT_FILTERS, parseFilters, toSearchParams } from '@/features/filters/model'
import { SearchBar } from '@/features/filters/SearchBar'
import { requestGeolocation, useUserPoint } from '@/features/user-point/model'
import { plural } from '@/shared/lib/plural'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Skeleton } from '@/shared/ui/Skeleton'
import { OrderCard } from '@/widgets/order-card/OrderCard'
import { MapView } from '@/widgets/map/MapView'
import { buildMarkers } from '@/widgets/map/markers'

const ORDER_FORMS: [string, string, string] = ['заказ', 'заказа', 'заказов']
const RADIUS_STEPS = [5, 10, 25, 50] as const
const PULL_THRESHOLD_PX = 60

/** Key used while no point is known; the query is disabled in that state. */
const NO_POINT_FILTERS: FeedFilters = { ...DEFAULT_FILTERS, lat: 0, lon: 0 }

const secondaryLinkClasses =
  'inline-flex min-h-11 items-center justify-center rounded-[10px] bg-sage-100 px-4 text-base font-medium text-moss-600 transition-colors hover:bg-mint-300 focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:outline-none'

function nextRadius(current: number): number {
  return RADIUS_STEPS.find((step) => step > current) ?? 50
}

function atTop(): boolean {
  const scrollTop = document.scrollingElement?.scrollTop ?? window.scrollY
  return scrollTop === 0
}

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-28 w-full" />
      ))}
    </div>
  )
}

/** Feed of available orders around the user's point, with an infinite list. */
export function FeedPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [point, setPoint] = useUserPoint()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [locating, setLocating] = useState(false)
  const [highlightId, setHighlightId] = useState<number | null>(null)
  const search = searchParams.toString()

  const filters = useMemo(
    () => (point ? parseFilters(search, point) : null),
    [point, search],
  )

  const query = useInfiniteQuery({
    queryKey: qk.orders.available(filters ?? NO_POINT_FILTERS),
    queryFn: ({ pageParam }) => {
      if (!filters) throw new Error('Feed requires a point')
      return fetchAvailableOrders(filters, pageParam)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) =>
      lastPage.total !== null && pages.length * FEED_PAGE_SIZE < lastPage.total
        ? pages.length + 1
        : undefined,
    enabled: filters !== null,
  })

  const { hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = query
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const pullStart = useRef<number | null>(null)
  const cardRefs = useRef(new Map<number, HTMLDivElement>())

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasNextPage) return
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
        void fetchNextPage()
      }
    })
    observer.observe(sentinel)

    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const orders = useMemo(
    () => query.data?.pages.flatMap((page) => page.orders) ?? [],
    [query.data],
  )
  const mapMarkers = useMemo(() => buildMarkers(orders), [orders])
  const total = query.data?.pages[0]?.total ?? null
  const count = total ?? orders.length
  const radiusKm = filters?.radiusKm ?? DEFAULT_FILTERS.radiusKm
  const countLabel = `${count} ${plural(count, ORDER_FORMS)} · ${radiusKm} км`
  const searchQuery = filters?.q ?? (searchParams.get('q') ?? '')
  const activeCount = filters ? countActiveFilters(filters) : 0
  const filtersLabel = activeCount > 0 ? `Фильтры · ${activeCount}` : 'Фильтры'

  function applyFilters(next: FeedFilters): void {
    const pointChanged =
      point !== null && (next.lat !== point.lat || next.lon !== point.lon)
    if (pointChanged) setPoint({ lat: next.lat, lon: next.lon })

    const params = toSearchParams(next)
    if (params.toString() === search) {
      if (!pointChanged) void refetch()
      return
    }
    setSearchParams(params, { replace: true })
  }

  function handleSearch(q: string): void {
    if (filters) {
      applyFilters({ ...filters, q })
      return
    }
    applyFilters({ ...NO_POINT_FILTERS, q })
  }

  function widenRadius(): void {
    if (!filters) return
    applyFilters({ ...filters, radiusKm: nextRadius(filters.radiusKm) })
  }

  function resetFilters(): void {
    if (!point) return
    applyFilters({ ...DEFAULT_FILTERS, lat: point.lat, lon: point.lon })
  }

  function highlightOrder(id: number): void {
    setHighlightId(id)
    const card = cardRefs.current.get(id)
    if (card && typeof card.scrollIntoView === 'function') {
      card.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }

  async function handleRequestLocation(): Promise<void> {
    setLocating(true)
    try {
      const next = await requestGeolocation()
      if (next) setPoint(next)
    } finally {
      setLocating(false)
    }
  }

  function handleTouchStart(event: TouchEvent<HTMLElement>): void {
    if (!atTop()) return
    pullStart.current = event.touches[0]?.clientY ?? null
  }

  function handleTouchMove(event: TouchEvent<HTMLElement>): void {
    if (pullStart.current === null) return
    const current = event.touches[0]?.clientY
    if (current === undefined) return
    if (current < pullStart.current) pullStart.current = null
  }

  function handleTouchEnd(event: TouchEvent<HTMLElement>): void {
    const start = pullStart.current
    pullStart.current = null
    if (start === null) return
    const end = event.changedTouches[0]?.clientY
    if (end !== undefined && end - start > PULL_THRESHOLD_PX && atTop()) void refetch()
  }

  const showEmpty = filters !== null && !query.isLoading && !query.isError && orders.length === 0
  const searching = filters !== null && filters.q.trim() !== ''

  return (
    <section
      className="flex flex-col gap-4"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-forest-900">Заказы рядом</h1>
            {orders.length > 0 && <p className="text-sm text-muted-strong">{countLabel}</p>}
          </div>

          <div className="flex flex-col gap-2">
            <SearchBar value={searchQuery} onChange={handleSearch} />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                disabled={filters === null}
                onClick={() => setSheetOpen(true)}
              >
                {filtersLabel}
              </Button>
              <Link to="/map" className={secondaryLinkClasses}>
                Карта
              </Link>
            </div>

            {filters && <ActiveFilters value={filters} onChange={applyFilters} />}
          </div>

          {point === null ? (
            <EmptyState
              title="Укажите, где искать"
              description="Разрешите геолокацию или выберите точку на карте — покажем заказы рядом."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button loading={locating} onClick={() => void handleRequestLocation()}>
                    Разрешить геолокацию
                  </Button>
                  <Link to="/map" className={secondaryLinkClasses}>
                    Выбрать на карте
                  </Link>
                </div>
              }
            />
          ) : query.isLoading ? (
            <FeedSkeleton />
          ) : query.isError && orders.length === 0 ? (
            <EmptyState
              title="Не удалось загрузить заказы"
              description="Проверьте соединение и попробуйте ещё раз."
              action={<Button onClick={() => void refetch()}>Повторить</Button>}
            />
          ) : showEmpty ? (
            searching ? (
              <EmptyState
                title="По запросу ничего не найдено"
                description="Попробуйте изменить запрос или сбросить фильтры."
                action={
                  <Button variant="ghost" onClick={resetFilters}>
                    Сбросить фильтры
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title={`В радиусе ${radiusKm} км заказов нет`}
                description="Попробуйте увеличить радиус поиска или изменить фильтры."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button onClick={widenRadius}>Увеличить радиус</Button>
                    <Button variant="ghost" onClick={resetFilters}>
                      Сбросить фильтры
                    </Button>
                  </div>
                }
              />
            )
          ) : (
            <>
              {query.isError && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-card p-3">
                  <span className="text-sm text-muted-strong">
                    Не удалось обновить список заказов.
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => void refetch()}>
                    Повторить
                  </Button>
                </div>
              )}

              <div role="list" className="flex flex-col gap-3">
                {orders.map((order) => (
                  <div
                    key={order.id}
                    ref={(node) => {
                      if (node) cardRefs.current.set(order.id, node)
                      else cardRefs.current.delete(order.id)
                    }}
                    data-order-id={order.id}
                    onMouseEnter={() => setHighlightId(order.id)}
                    onFocus={() => setHighlightId(order.id)}
                    onMouseLeave={() => setHighlightId(null)}
                  >
                    <OrderCard
                      order={order}
                      userPoint={point}
                      selected={highlightId === order.id}
                      onClick={() => navigate(`/orders/${order.id}`)}
                    />
                  </div>
                ))}
              </div>

              {hasNextPage && (
                <div className="flex flex-col items-center gap-2">
                  <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
                  <Button
                    variant="secondary"
                    onClick={() => void fetchNextPage()}
                    loading={isFetchingNextPage}
                  >
                    Показать ещё
                  </Button>
                </div>
              )}
            </>
          )}

        </div>

        {point && (
          <aside
            data-testid="feed-map"
            aria-label="Карта заказов"
            className="hidden overflow-hidden rounded-2xl border border-line bg-card lg:sticky lg:top-24 lg:block lg:h-[calc(100dvh-8rem)]"
          >
            <MapView
              markers={mapMarkers}
              center={point}
              highlightId={highlightId}
              onSelect={highlightOrder}
              className="h-full"
            />
          </aside>
        )}
      </div>

      <FiltersSheet
        open={sheetOpen}
        value={filters ?? NO_POINT_FILTERS}
        total={total}
        onApply={applyFilters}
        onClose={() => setSheetOpen(false)}
      />
    </section>
  )
}
