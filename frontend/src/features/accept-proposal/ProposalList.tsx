import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ApiError } from '@/api/errors'
import { acceptProposal } from '@/api/proposals'
import { qk } from '@/api/queryKeys'
import type { Order, Proposal } from '@/api/types'
import { fetchUser } from '@/api/users'
import { formatMoney, formatShortDate } from '@/shared/lib/format'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Card } from '@/shared/ui/Card'
import { AcceptProposalDialog } from './AcceptProposalDialog'

export interface ProposalListProps {
  order: Order
  proposals: Proposal[]
  /** Called after a successful accept, before navigating to the chats. */
  onAccepted(): void
}

const NAME_STALE_MS = 5 * 60_000

function acceptErrorMessage(error: unknown): string | null {
  if (!error) return null
  return error instanceof ApiError ? error.message : 'Не удалось принять отклик'
}

/** Owner's list of proposals with the accept action for pending ones. */
export function ProposalList({ order, proposals, onAccepted }: ProposalListProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<Proposal | null>(null)

  // One public-name query per executor; the dialog reuses the same cache.
  const nameQueries = useQueries({
    queries: proposals.map((proposal) => ({
      queryKey: qk.users.detail(proposal.executor_id),
      queryFn: () => fetchUser(proposal.executor_id),
      staleTime: NAME_STALE_MS,
    })),
  })

  const executorNames = new Map<number, string>()
  proposals.forEach((proposal, index) => {
    const username = nameQueries[index]?.data?.username
    if (username) executorNames.set(proposal.executor_id, username)
  })

  const accept = useMutation({
    mutationFn: (proposal: Proposal) => acceptProposal(order.id, proposal.id),
    onSuccess: async () => {
      setTarget(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.orders.detail(order.id) }),
        queryClient.invalidateQueries({ queryKey: qk.orders.my() }),
        queryClient.invalidateQueries({ queryKey: qk.proposals.forOrder(order.id) }),
      ])
      onAccepted()
      // The chat detail screen arrives with the chats task; the list is the
      // safe destination until then.
      navigate('/chats')
    },
    onError: () => {
      // The order or proposal changed elsewhere: refresh both to show the truth.
      void queryClient.invalidateQueries({ queryKey: qk.orders.detail(order.id) })
      void queryClient.invalidateQueries({ queryKey: qk.proposals.forOrder(order.id) })
    },
  })

  if (proposals.length === 0) return null

  return (
    <>
      <ul className="flex flex-col gap-3">
        {proposals.map((proposal) => (
          <li key={proposal.id}>
            <Card className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-forest-900">
                  {executorNames.get(proposal.executor_id) ?? `Исполнитель #${proposal.executor_id}`}
                </p>
                <Badge status={proposal.status} />
              </div>

              <p className="text-sm text-muted-strong">
                Оставлен {formatShortDate(proposal.created_at)}
              </p>

              <p className="text-sm text-muted-strong">
                Цена:{' '}
                <span className="text-base font-semibold text-forest-900">
                  {formatMoney(proposal.proposed_price)}
                </span>
              </p>

              {proposal.message && (
                <p className="text-base whitespace-pre-line text-forest-900">{proposal.message}</p>
              )}

              {proposal.status === 'pending' && order.status === 'open' && (
                <Button
                  className="self-start"
                  onClick={() => {
                    accept.reset()
                    setTarget(proposal)
                  }}
                >
                  Принять
                </Button>
              )}
            </Card>
          </li>
        ))}
      </ul>

      <AcceptProposalDialog
        open={target !== null}
        proposal={target}
        executorName={target ? (executorNames.get(target.executor_id) ?? null) : null}
        pending={accept.isPending}
        error={acceptErrorMessage(accept.error)}
        onConfirm={() => {
          if (target) accept.mutate(target)
        }}
        onCancel={() => {
          if (accept.isPending) return
          setTarget(null)
          accept.reset()
        }}
      />
    </>
  )
}
