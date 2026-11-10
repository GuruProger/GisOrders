import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { fetchMyOrders } from '@/api/orders'
import { fetchMyProposals, type ProposalWithOrder } from '@/api/proposals'
import { qk } from '@/api/queryKeys'
import type { Order, OrderStatus } from '@/api/types'
import { useRoleMode } from '@/features/switch-role/model'
import { formatDeadline, formatMoney } from '@/shared/lib/format'
import { plural } from '@/shared/lib/plural'
import { useDocumentTitle } from '@/shared/lib/use-document-title'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Skeleton } from '@/shared/ui/Skeleton'

const PROPOSAL_FORMS: [string, string, string] = ['отклик', 'отклика', 'откликов']

const ORDER_GROUPS: Array<{ status: OrderStatus; title: string }> = [
  { status: 'open', title: 'Открытые' },
  { status: 'assigned', title: 'В работе' },
  { status: 'closed', title: 'Закрытые' },
]

const WORK_GROUPS: Array<{ status: OrderStatus; title: string }> = [
  { status: 'assigned', title: 'В работе' },
  { status: 'closed', title: 'Завершённые' },
]

function OrderSummary({ order }: { order: Order }) {
  return (
    <li>
      <Card className="p-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold text-forest-900">
              <Link
                to={`/orders/${order.id}`}
                className="hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {order.title}
              </Link>
            </h3>
            <Badge status={order.status} />
          </div>

          <p className="text-sm text-muted-strong">
            <span>{formatDeadline(order.deadline)}</span> · {order.address}
          </p>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-strong">
              {order.status === 'open' &&
                (order.proposals_count === 0
                  ? 'Пока нет откликов'
                  : `${order.proposals_count} ${plural(order.proposals_count, PROPOSAL_FORMS)}`)}
            </span>
            <span className="text-base font-semibold text-forest-900">
              {order.max_price !== null
                ? formatMoney(order.max_price)
                : order.min_price !== null
                  ? formatMoney(order.min_price)
                  : '—'}
            </span>
          </div>
        </div>
      </Card>
    </li>
  )
}

function WorkSummary({ proposal }: { proposal: ProposalWithOrder }) {
  const order = proposal.order
  return (
    <li>
      <Card className="p-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold text-forest-900">
              <Link
                to={`/orders/${proposal.order_id}`}
                className="hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {order?.title ?? `Заказ #${proposal.order_id}`}
              </Link>
            </h3>
            <Badge status={order?.status ?? 'assigned'} />
          </div>

          {order && (
            <p className="text-sm text-muted-strong">
              <span>{formatDeadline(order.deadline)}</span> · {order.address}
            </p>
          )}

          <p className="text-sm text-muted-strong">
            Ваша цена:{' '}
            <span className="text-base font-semibold text-forest-900">
              {formatMoney(proposal.proposed_price)}
            </span>
          </p>
        </div>
      </Card>
    </li>
  )
}

function GroupHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h2 className="text-lg font-semibold text-forest-900">{title}</h2>
      <span className="text-sm text-muted-strong">{count}</span>
    </div>
  )
}

function FeedLink() {
  return (
    <Link
      to="/"
      className="inline-flex min-h-11 items-center justify-center text-sm font-medium text-moss-600 hover:underline focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:outline-none"
    >
      К ленте
    </Link>
  )
}

/** Primary call to action for a customer with no orders yet. */
function CreateOrderLink() {
  return (
    <Link
      to="/orders/new"
      className="inline-flex min-h-11 items-center justify-center gap-1 rounded-[10px] bg-moss-600 px-4 text-base font-medium text-white transition-colors hover:bg-leaf-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
    >
      <span aria-hidden="true" className="text-lg leading-none">+</span>
      Создать заказ
    </Link>
  )
}

/** «Мои заказы» in customer mode, «Мои работы» in executor mode. */
export function MyOrdersPage() {
  const [mode] = useRoleMode()
  const isExecutor = mode === 'executor'
  useDocumentTitle(`${isExecutor ? 'Мои работы' : 'Мои заказы'} — GisOrders`)

  const ordersQuery = useQuery({
    queryKey: qk.orders.my(),
    queryFn: () => fetchMyOrders(),
    enabled: !isExecutor,
  })

  const proposalsQuery = useQuery({
    queryKey: qk.proposals.mine(),
    queryFn: fetchMyProposals,
    enabled: isExecutor,
  })

  const activeQuery = isExecutor ? proposalsQuery : ordersQuery
  const orders = ordersQuery.data ?? []
  const works = (proposalsQuery.data ?? []).filter(
    (proposal) => proposal.status === 'accepted',
  )

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-6">
      <h1 className="text-2xl font-semibold text-forest-900">
        {isExecutor ? 'Мои работы' : 'Мои заказы'}
      </h1>

      {activeQuery.isLoading && (
        <>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </>
      )}

      {activeQuery.isError && (
        <EmptyState
          title="Не удалось загрузить данные"
          description="Проверьте соединение и попробуйте ещё раз."
          action={<Button onClick={() => void activeQuery.refetch()}>Повторить</Button>}
        />
      )}

      {!isExecutor && !activeQuery.isLoading && !activeQuery.isError && orders.length === 0 && (
        <EmptyState
          title="Пока нет заказов"
          description="Создайте первый заказ — исполнители рядом увидят его в ленте."
          action={
            <div className="flex flex-col items-center gap-1">
              <CreateOrderLink />
              <FeedLink />
            </div>
          }
        />
      )}

      {!isExecutor &&
        !activeQuery.isLoading &&
        !activeQuery.isError &&
        ORDER_GROUPS.map(({ status, title }) => {
          const group = orders.filter((order) => order.status === status)
          if (group.length === 0) return null
          return (
            <section key={status} className="flex flex-col gap-2" aria-label={title}>
              <GroupHeading title={title} count={group.length} />
              <ul className="flex flex-col gap-3">
                {group.map((order) => (
                  <OrderSummary key={order.id} order={order} />
                ))}
              </ul>
            </section>
          )
        })}

      {isExecutor && !activeQuery.isLoading && !activeQuery.isError && works.length === 0 && (
        <EmptyState
          title="Пока нет работ"
          description="Откликнитесь на заказ — принятые отклики появятся здесь."
          action={<FeedLink />}
        />
      )}

      {isExecutor &&
        !activeQuery.isLoading &&
        !activeQuery.isError &&
        WORK_GROUPS.map(({ status, title }) => {
          const group = works.filter(
            (proposal) => (proposal.order?.status ?? 'assigned') === status,
          )
          if (group.length === 0) return null
          return (
            <section key={status} className="flex flex-col gap-2" aria-label={title}>
              <GroupHeading title={title} count={group.length} />
              <ul className="flex flex-col gap-3">
                {group.map((proposal) => (
                  <WorkSummary key={proposal.id} proposal={proposal} />
                ))}
              </ul>
            </section>
          )
        })}
    </section>
  )
}
