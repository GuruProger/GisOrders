import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { fetchOrder } from '@/api/orders'
import { createOrder, updateOrder } from '@/api/orders'
import { qk } from '@/api/queryKeys'
import { useToast } from '@/app/providers'
import { PickPointMap } from '@/features/pick-point/PickPointMap'
import { PhotoUploader } from '@/features/upload-photos/PhotoUploader'
import { TREE_TYPES } from '@/shared/config/trees'
import { useDocumentTitle } from '@/shared/lib/use-document-title'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Field } from '@/shared/ui/Field'
import { Input } from '@/shared/ui/Input'
import { Skeleton } from '@/shared/ui/Skeleton'
import { Textarea } from '@/shared/ui/Textarea'
import { zodResolver } from '@/shared/lib/zodResolver'
import { useForm } from 'react-hook-form'
import {
  EMPTY_FORM,
  orderSchema,
  toOrderInput,
  type OrderFormValues,
} from './schema'
import { clearDraft, loadDraft, saveDraft } from './draft'

/** Converts an ISO timestamp into the value a `datetime-local` input expects. */
function toLocalInput(iso: string): string {
  const date = new Date(iso)
  const pad = (value: number) => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  )
}

/** Create and edit share one screen; the route decides which mode is active. */
export function OrderEditPage() {
  const { id } = useParams()
  const isEdit = id !== undefined
  const orderId = isEdit ? Number(id) : null
  useDocumentTitle(`${isEdit ? 'Редактирование заказа' : 'Новый заказ'} — GisOrders`)

  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()

  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null)
  const [pointError, setPointError] = useState<string | null>(null)
  const [photos, setPhotos] = useState<string[]>([])

  // The draft is a create-mode affordance: in edit mode server data wins.
  const [initialValues] = useState<OrderFormValues>(() =>
    isEdit ? EMPTY_FORM : (loadDraft() ?? EMPTY_FORM),
  )

  const form = useForm<OrderFormValues>({
    resolver: zodResolver(orderSchema),
    defaultValues: initialValues,
    mode: 'onSubmit',
  })
  const { register, handleSubmit, watch, reset, formState: { errors } } = form

  const orderQuery = useQuery({
    queryKey: qk.orders.detail(orderId ?? 0),
    queryFn: () => fetchOrder(orderId as number),
    enabled: isEdit,
  })

  const order = isEdit ? orderQuery.data : undefined
  const locked = isEdit && order !== undefined && order.status !== 'open'

  // Prefill once the order arrives; photos and the point come from the server.
  useEffect(() => {
    if (!order) return
    reset({
      title: order.title,
      description: order.description,
      min_price: order.min_price === null ? '' : String(order.min_price),
      max_price: order.max_price === null ? '' : String(order.max_price),
      deadline: toLocalInput(order.deadline),
      address: order.address,
      tree_type: order.tree_type,
      tree_height: String(order.tree_height),
      tree_diameter: String(order.tree_diameter),
    })
    setPhotos(order.photos ?? [])
    setPoint({ lat: order.lat, lon: order.lon })
  }, [order, reset])

  // Persist the create-mode draft (debounced inside saveDraft). The immediate
  // call covers point/photo changes that do not touch the form fields.
  useEffect(() => {
    if (isEdit) return
    const saveCurrent = () => {
      saveDraft({ ...EMPTY_FORM, ...form.getValues(), point, photos })
    }
    saveCurrent()
    const subscription = watch((values) => {
      saveDraft({ ...EMPTY_FORM, ...values, point, photos })
    })
    return () => subscription.unsubscribe()
  }, [watch, isEdit, point, photos, form])

  const save = useMutation({
    mutationFn: (input: Parameters<typeof createOrder>[0]) =>
      isEdit ? updateOrder(orderId as number, input) : createOrder(input),
    onSuccess: async (saved) => {
      clearDraft()
      await queryClient.invalidateQueries({ queryKey: qk.orders.all })
      toast.show(isEdit ? 'Изменения сохранены' : 'Заказ опубликован')
      navigate(`/orders/${saved.id}`)
    },
  })

  const submit = handleSubmit((values) => {
    if (!point) {
      setPointError('Поставьте точку на карте')
      return
    }
    setPointError(null)
    save.mutate({ ...toOrderInput(values, point), photos })
  })

  const serverError =
    save.error instanceof Error ? save.error.message : 'Не удалось сохранить заказ'

  if (isEdit && orderQuery.isError) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-6">
        <h1 className="text-2xl font-semibold text-forest-900">Редактирование заказа</h1>
        <EmptyState
          title="Не удалось загрузить заказ"
          description="Проверьте соединение и попробуйте ещё раз."
          action={
            <Button onClick={() => void orderQuery.refetch()}>Повторить</Button>
          }
        />
      </section>
    )
  }

  if (isEdit && !order) {
    return (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-6">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-96 w-full" />
      </section>
    )
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-6">
      <h1 className="text-2xl font-semibold text-forest-900">
        {isEdit ? 'Редактирование заказа' : 'Новый заказ'}
      </h1>

      {!isEdit && (
        <p className="text-sm text-muted-strong">Черновик сохраняется автоматически</p>
      )}

      {locked && (
        <Card className="p-4">
          <p className="text-sm text-muted-strong">
            Редактирование недоступно: заказ уже в работе или закрыт.
          </p>
        </Card>
      )}

      <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
        <Field label="Название" htmlFor="order-title" error={errors.title?.message}>
          <Input
            id="order-title"
            type="text"
            maxLength={200}
            disabled={locked}
            {...register('title')}
          />
        </Field>

        <Field
          label="Описание"
          htmlFor="order-description"
          hint="Что нужно сделать, какие работы входят"
          error={errors.description?.message}
        >
          <Textarea id="order-description" rows={4} disabled={locked} {...register('description')} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Цена от" htmlFor="order-min-price" error={errors.min_price?.message}>
            <Input
              id="order-min-price"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              disabled={locked}
              {...register('min_price')}
            />
          </Field>

          <Field label="Цена до" htmlFor="order-max-price" error={errors.max_price?.message}>
            <Input
              id="order-max-price"
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              disabled={locked}
              {...register('max_price')}
            />
          </Field>
        </div>

        <Field
          label="Срок"
          htmlFor="order-deadline"
          error={errors.deadline?.message}
        >
          <Input id="order-deadline" type="datetime-local" disabled={locked} {...register('deadline')} />
        </Field>

        <Field
          label="Адрес"
          htmlFor="order-address"
          hint="Поставьте точку на карте, адрес увидит исполнитель"
          error={errors.address?.message}
        >
          <Input
            id="order-address"
            type="text"
            maxLength={500}
            disabled={locked}
            {...register('address')}
          />
        </Field>

        <Field
          label="Порода"
          htmlFor="order-tree-type"
          hint="Можно выбрать из списка или ввести свою"
          error={errors.tree_type?.message}
        >
          <Input id="order-tree-type" type="text" list="tree-types" maxLength={50} disabled={locked} {...register('tree_type')} />
          <datalist id="tree-types">
            {TREE_TYPES.map((type) => (
              <option key={type} value={type} />
            ))}
          </datalist>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Высота, м" htmlFor="order-tree-height" error={errors.tree_height?.message}>
            <Input
              id="order-tree-height"
              type="number"
              inputMode="decimal"
              min="1"
              step="0.5"
              disabled={locked}
              {...register('tree_height')}
            />
          </Field>

          <Field label="Диаметр, см" htmlFor="order-tree-diameter" error={errors.tree_diameter?.message}>
            <Input
              id="order-tree-diameter"
              type="number"
              inputMode="numeric"
              min="1"
              step="1"
              disabled={locked}
              {...register('tree_diameter')}
            />
          </Field>
        </div>

        <Field label="Фотографии" htmlFor="order-photos">
          <PhotoUploader photos={photos} onChange={setPhotos} disabled={locked} />
        </Field>

        <Field
          label="Точка на карте"
          htmlFor="order-point"
          error={pointError ?? undefined}
          hint="Клик по карте ставит точку заказа"
        >
          <div id="order-point">
            <PickPointMap
              point={point}
              onPick={(next) => {
                setPoint(next)
                setPointError(null)
              }}
              disabled={locked}
            />
          </div>
        </Field>

        {save.isError && (
          <p
            role="alert"
            className="rounded-lg bg-terracotta-50 px-3 py-2 text-sm text-terracotta-600"
          >
            {serverError}
          </p>
        )}

        <Button type="submit" loading={save.isPending} disabled={locked} className="self-start">
          {isEdit ? 'Сохранить' : 'Опубликовать'}
        </Button>
      </form>
    </section>
  )
}
