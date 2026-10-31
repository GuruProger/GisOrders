import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ApiError } from '@/api/errors'
import { closeOrder, deleteOrder, fetchOrder } from '@/api/orders'
import { qk } from '@/api/queryKeys'
import type { Order } from '@/api/types'
import { useToast } from '@/app/providers'
import { useSession } from '@/features/auth/session'
import { useRoleMode } from '@/features/switch-role/model'
import { formatDeadline, formatMoney, formatShortDate } from '@/shared/lib/format'
import { useDocumentTitle } from '@/shared/lib/use-document-title'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Skeleton } from '@/shared/ui/Skeleton'
import { MapView } from '@/widgets/map/MapView'
import { buildMarkers } from '@/widgets/map/markers'
import { PhotoGallery } from './PhotoGallery'

type DialogKind = 'close' | 'delete' | null

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

function errorMessage(error: unknown): string | null {
  if (!error) return null
  return error instanceof Error ? error.message : 'Не удалось выполнить действие'
}

/** `2 000 ₽ — 3 500 ₽`, a single bound, or «Не указана». */
function formatPriceRange(order: Order): string {
  const { min_price: min, max_price: max } = order
  if (min === null && max === null) return 'Не указана'
  if (min !== null && max !== null) {
    return min === max ? formatMoney(min) : `${formatMoney(min)} — ${formatMoney(max)}`
  }
  return min !== null ? formatMoney(min) : formatMoney(max as number)
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="text-base text-forest-900">{value}</dd>
    </div>
  )
}

/** Order details with status-aware actions for the owner and executors. */
export function OrderPage() {
  const { id: rawId } = useParams()
  const id = Number(rawId)
  const validId = Number.isInteger(id) && id > 0
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const user = useSession((state) => state.user)
  const [mode, setMode] = useRoleMode()
  const [dialog, setDialog] = useState<DialogKind>(null)

  const query = useQuery({
    queryKey: qk.orders.detail(id),
    queryFn: () => fetchOrder(id),
    enabled: validId,
  })

  const order = query.data ?? null
  const markers = useMemo(() => (order ? buildMarkers([order]) : []), [order])

  useDocumentTitle(order ? `${order.title} — GisOrders` : 'Заказ — GisOrders')

  const close = useMutation({
    mutationFn: () => closeOrder(id),
    onSuccess: () => {
      setDialog(null)
      void queryClient.invalidateQueries({ queryKey: qk.orders.all })
      toast.show('Заказ закрыт')
    },
  })

  const remove = useMutation({
    mutationFn: () => deleteOrder(id),
    onSuccess: () => {
      setDialog(null)
      // The list refreshes on the next screen; the detail query may answer 404
      // once before this page unmounts, which is expected for a deleted order.
      void queryClient.invalidateQueries({ queryKey: qk.orders.all })
      toast.show('Заказ удалён')
      navigate('/my/orders', { replace: true })
    },
  })

  if (!validId || isNotFound(query.error)) {
    return (
      <EmptyState
        title="Заказ не найден"
        description="Возможно, ссылка устарела или заказ удалён."
        action={<Button onClick={() => navigate('/')}>К ленте</Button>}
      />
    )
  }

  if (query.isLoading) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-3">
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </section>
    )
  }

  if (query.isError || !order) {
    return (
      <EmptyState
        title="Не удалось загрузить заказ"
        description="Проверьте соединение и попробуйте ещё раз."
        action={<Button onClick={() => void query.refetch()}>Повторить</Button>}
      />
    )
  }

  const isOwner = user !== null && user.id === order.customer_id
  const canRespond = !isOwner && order.status === 'open'
  const priceMissing = order.min_price === null && order.max_price === null

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-6">
      <Link
        to="/"
        className="inline-flex min-h-11 items-center text-sm font-medium text-moss-600 hover:underline focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:outline-none"
      >
        ← К ленте
      </Link>

      <PhotoGallery photos={order.photos} title={order.title} />

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold text-forest-900">{order.title}</h1>
        <Badge status={order.status} />
      </div>

      <p className="text-sm text-muted-strong">Опубликован {formatShortDate(order.created_at)}</p>

      <p className="text-base whitespace-pre-line text-forest-900">{order.description}</p>

      <Card className="p-4">
        <dl className="grid gap-4 sm:grid-cols-2">
          <InfoRow label="Адрес" value={order.address} />
          <InfoRow label="Срок" value={formatDeadline(order.deadline)} />
          <InfoRow label="Цена" value={formatPriceRange(order)} />
          <InfoRow
            label="Порода и размеры"
            value={`${order.tree_type} · ${order.tree_height} м · ⌀ ${order.tree_diameter} см`}
          />
          {order.status === 'closed' && order.closed_at && (
            <InfoRow label="Закрыт" value={formatShortDate(order.closed_at)} />
          )}
        </dl>
      </Card>

      <div className="overflow-hidden rounded-xl border border-line bg-card">
        <MapView
          markers={markers}
          center={{ lat: order.lat, lon: order.lon }}
          className="h-56"
        />
      </div>

      {order.status === 'assigned' && (
        <Card className="p-4">
          <p className="font-semibold text-forest-900">Исполнитель выбран</p>
          <p className="text-sm text-muted-strong">
            Заказ передан исполнителю, обсуждение продолжается в чате.
          </p>
        </Card>
      )}

      {isOwner && order.status === 'open' && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => navigate(`/orders/${order.id}/edit`)}>
            Редактировать
          </Button>
          <Button onClick={() => setDialog('close')}>Закрыть заказ</Button>
          <Button variant="danger" onClick={() => setDialog('delete')}>
            Удалить
          </Button>
        </div>
      )}

      {canRespond && (
        <Card className="flex flex-col gap-2 p-4">
          {mode === 'executor' ? (
            <>
              <Button disabled title="Форма отклика появится в следующем обновлении">
                Откликнуться
              </Button>
              <p className="text-sm text-muted-strong">
                Форма отклика появится в следующем обновлении.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-strong">
                Вы в режиме заказчика. Чтобы откликнуться на чужой заказ, переключитесь в режим
                исполнителя.
              </p>
              <Button variant="secondary" onClick={() => setMode('executor')}>
                Перейти в режим исполнителя
              </Button>
            </>
          )}
        </Card>
      )}

      {priceMissing && isOwner && order.status === 'open' && (
        <p className="text-sm text-muted-strong">
          Укажите цену при редактировании, чтобы исполнителям было проще выбрать заказ.
        </p>
      )}

      <ConfirmDialog
        open={dialog === 'close'}
        title="Закрыть заказ?"
        description="Заказ будет закрыт. Продолжить?"
        confirmLabel="Закрыть заказ"
        pending={close.isPending}
        error={errorMessage(close.error)}
        onConfirm={() => close.mutate()}
        onCancel={() => {
          if (!close.isPending) setDialog(null)
        }}
      />

      <ConfirmDialog
        open={dialog === 'delete'}
        title="Удалить заказ?"
        description="Заказ будет удалён без возможности восстановления."
        confirmLabel="Удалить"
        tone="danger"
        pending={remove.isPending}
        error={errorMessage(remove.error)}
        onConfirm={() => remove.mutate()}
        onCancel={() => {
          if (!remove.isPending) setDialog(null)
        }}
      />
    </section>
  )
}
