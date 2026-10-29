import { useInfiniteQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, type TouchEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { fetchAvailableOrders, FEED_PAGE_SIZE } from '@/api/orders'
import { qk } from '@/api/queryKeys'
import type { FeedFilters } from '@/api/types'
import { DEFAULT_FILTERS, parseFilters, toSearchParams } from '@/features/filters/model'
import { useUserPoint } from '@/features/user-point/model'
import { plural } from '@/shared/lib/plural'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Skeleton } from '@/shared/ui/Skeleton'
import { OrderCard } from '@/widgets/order-card/OrderCard'

const ORDER_FORMS: [string, string, string] = ['заказ', 'заказа', 'заказов']
const RADIUS_STEPS = [5, 10, 25, 50] as const
const PULL_THRESHOLD_PX = 60

/** Key used while no point is known; the query is disabled in that state. */
const NO_POINT_FILTERS: FeedFilters = { ...DEFAULT_FILTERS, lat: 0, lon: 0 }

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
  const [point] = useUserPoint()
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

  const orders = query.data?.pages.flatMap((page) => page.orders) ?? []
  const total = query.data?.pages[0]?.total ?? null
  const count = total ?? orders.length
  const radiusKm = filters?.radiusKm ?? DEFAULT_FILTERS.radiusKm
  const countLabel = `${count} ${plural(count, ORDER_FORMS)} · ${radiusKm} км`

  function applyFilters(next: FeedFilters): void {
    const params = toSearchParams(next)
    if (params.toString() === search) {
      void refetch()
      return
    }
    setSearchParams(params, { replace: true })
  }

  function widenRadius(): void {
    if (!filters) return
    applyFilters({ ...filters, radiusKm: nextRadius(filters.radiusKm) })
  }

  function resetFilters(): void {
    if (!point) return
    applyFilters({ ...DEFAULT_FILTERS, lat: point.lat, lon: point.lon })
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

  return (
    <section
      className="flex flex-col gap-4"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-forest-900">Заказы рядом</h1>
        {orders.length > 0 && <p className="text-sm text-muted-strong">{countLabel}</p>}
      </div>

      {point === null ? (
        <FeedSkeleton />
      ) : query.isLoading ? (
        <FeedSkeleton />
      ) : query.isError && orders.length === 0 ? (
        <EmptyState
          title="Не удалось загрузить заказы"
          description="Проверьте соединение и попробуйте ещё раз."
          action={<Button onClick={() => void refetch()}>Повторить</Button>}
        />
      ) : showEmpty ? (
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
              <OrderCard
                key={order.id}
                order={order}
                userPoint={point}
                onClick={() => navigate(`/orders/${order.id}`)}
              />
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
    </section>
  )
}
