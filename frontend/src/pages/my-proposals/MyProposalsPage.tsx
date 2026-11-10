import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { ApiError } from '@/api/errors'
import type { ProposalWithOrder } from '@/api/proposals'
import { fetchMyProposals, withdrawProposal } from '@/api/proposals'
import { qk } from '@/api/queryKeys'
import { useToast } from '@/app/providers'
import { formatMoney, formatShortDate } from '@/shared/lib/format'
import { useDocumentTitle } from '@/shared/lib/use-document-title'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Skeleton } from '@/shared/ui/Skeleton'

function withdrawErrorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Не удалось отозвать отклик'
}

function ProposalCard({
  proposal,
  onWithdraw,
}: {
  proposal: ProposalWithOrder
  onWithdraw: () => void
}) {
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
                {proposal.order?.title}
              </Link>
            </h3>
            <Badge status={proposal.status} />
          </div>

          <p className="text-sm text-muted-strong">
            Оставлен {formatShortDate(proposal.created_at)}
          </p>

          <p className="text-sm text-muted-strong">
            Ваша цена:{' '}
            <span className="text-base font-semibold text-forest-900">
              {formatMoney(proposal.proposed_price)}
            </span>
          </p>

          <div className="mt-1">
            {proposal.status === 'pending' && (
              <Button variant="secondary" onClick={onWithdraw}>
                Отозвать
              </Button>
            )}
            {proposal.status === 'accepted' && (
              <Link
                to="/chats"
                className="inline-flex min-h-11 items-center text-sm font-medium text-moss-600 hover:underline focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:outline-none"
              >
                Перейти в чат
              </Link>
            )}
          </div>
        </div>
      </Card>
    </li>
  )
}

/** «Мои отклики»: proposals of the current executor with per-status actions. */
export function MyProposalsPage() {
  useDocumentTitle('Мои отклики — GisOrders')
  const queryClient = useQueryClient()
  const toast = useToast()
  const [target, setTarget] = useState<ProposalWithOrder | null>(null)

  const query = useQuery({ queryKey: qk.proposals.mine(), queryFn: fetchMyProposals })

  const withdraw = useMutation({
    mutationFn: (proposal: ProposalWithOrder) => withdrawProposal(proposal.id),
    onSuccess: async (_, proposal) => {
      setTarget(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.proposals.mine() }),
        queryClient.invalidateQueries({ queryKey: qk.orders.detail(proposal.order_id) }),
        queryClient.invalidateQueries({ queryKey: qk.orders.all }),
      ])
      toast.show('Отклик отозван')
    },
  })

  const proposals = query.data ?? []

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-6">
      <h1 className="text-2xl font-semibold text-forest-900">Мои отклики</h1>

      {query.isLoading && (
        <>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </>
      )}

      {query.isError && (
        <EmptyState
          title="Не удалось загрузить отклики"
          description="Проверьте соединение и попробуйте ещё раз."
          action={<Button onClick={() => void query.refetch()}>Повторить</Button>}
        />
      )}

      {!query.isLoading && !query.isError && proposals.length === 0 && (
        <EmptyState
          title="Вы ещё не откликались"
          description="Найдите подходящий заказ и предложите свою цену."
          action={
            <Link
              to="/"
              className="inline-flex min-h-11 items-center text-sm font-medium text-moss-600 hover:underline focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:outline-none"
            >
              К ленте
            </Link>
          }
        />
      )}

      {proposals.length > 0 && (
        <ul className="flex flex-col gap-3">
          {proposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              onWithdraw={() => setTarget(proposal)}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={target !== null}
        title="Отозвать отклик?"
        description={`Отклик на «${target?.order?.title ?? ''}» будет отозван. Продолжить?`}
        confirmLabel="Отозвать"
        pending={withdraw.isPending}
        error={withdraw.isError ? withdrawErrorMessage(withdraw.error) : null}
        onConfirm={() => {
          if (target) withdraw.mutate(target)
        }}
        onCancel={() => {
          if (withdraw.isPending) return
          setTarget(null)
          withdraw.reset()
        }}
      />
    </section>
  )
}
