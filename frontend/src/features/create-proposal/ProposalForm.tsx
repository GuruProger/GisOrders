import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { ApiError } from '@/api/errors'
import { createProposal } from '@/api/proposals'
import { qk } from '@/api/queryKeys'
import { formatMoney } from '@/shared/lib/format'
import { zodResolver } from '@/shared/lib/zodResolver'
import { Button } from '@/shared/ui/Button'
import { Field } from '@/shared/ui/Field'
import { Input } from '@/shared/ui/Input'
import { Textarea } from '@/shared/ui/Textarea'
import { parsePrice, proposalSchema, type ProposalFormValues } from './schema'

export interface ProposalFormProps {
  orderId: number
  /** Upper bound of the customer's price, shown as a hint. */
  maxPrice?: number | null
  onCreated?: () => void
}

/** Executor's respond form for an open order; entries survive a failed submit. */
export function ProposalForm({ orderId, maxPrice = null, onCreated }: ProposalFormProps) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProposalFormValues>({
    resolver: zodResolver(proposalSchema),
    defaultValues: { price: '', message: '' },
  })

  const create = useMutation({
    mutationFn: (values: ProposalFormValues) =>
      createProposal(orderId, {
        proposed_price: parsePrice(values.price),
        message: values.message.trim() || undefined,
      }),
    onSuccess: async () => {
      reset()
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.proposals.mine() }),
        queryClient.invalidateQueries({ queryKey: qk.orders.detail(orderId) }),
        queryClient.invalidateQueries({ queryKey: qk.orders.all }),
      ])
      onCreated?.()
    },
  })

  const serverError =
    create.error instanceof ApiError ? create.error.message : 'Не удалось отправить отклик'

  const submit = handleSubmit(async (values) => {
    try {
      await create.mutateAsync(values)
    } catch {
      // The mutation error is rendered inside the form.
    }
  })

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <Field
        label="Ваша цена"
        htmlFor="proposal-price"
        hint={maxPrice !== null ? `Вилка заказчика: до ${formatMoney(maxPrice)}` : undefined}
        error={errors.price?.message}
      >
        <Input id="proposal-price" type="number" inputMode="decimal" min="1" step="1" {...register('price')} />
      </Field>

      <Field
        label="Сообщение"
        htmlFor="proposal-message"
        hint="Необязательно: расскажите, как выполните работу"
        error={errors.message?.message}
      >
        <Textarea id="proposal-message" rows={3} {...register('message')} />
      </Field>

      {create.isError && (
        <p
          role="alert"
          className="rounded-lg bg-terracotta-50 px-3 py-2 text-sm text-terracotta-600"
        >
          {serverError}
        </p>
      )}

      <Button type="submit" loading={create.isPending}>
        Откликнуться
      </Button>
    </form>
  )
}
