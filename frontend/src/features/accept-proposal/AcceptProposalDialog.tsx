import type { Proposal } from '@/api/types'
import { formatMoney } from '@/shared/lib/format'
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog'

export interface AcceptProposalDialogProps {
  open: boolean
  proposal: Proposal | null
  executorName?: string | null
  pending?: boolean
  error?: string | null
  onConfirm(): void
  onCancel(): void
}

/**
 * Confirms choosing an executor. Accepting rejects every other proposal and
 * closes their chats, so the copy states that before the irreversible action.
 */
export function AcceptProposalDialog({
  open,
  proposal,
  executorName = null,
  pending = false,
  error = null,
  onConfirm,
  onCancel,
}: AcceptProposalDialogProps) {
  return (
    <ConfirmDialog
      open={open && proposal !== null}
      title="Принять отклик?"
      description={
        proposal && (
          <div className="flex flex-col gap-2">
            <p>
              Вы принимаете отклик
              {executorName ? ` исполнителя ${executorName}` : ''} за{' '}
              {formatMoney(proposal.proposed_price)}.
            </p>
            <p>Остальные отклики будут отклонены, их чаты закроются.</p>
          </div>
        )
      }
      confirmLabel="Принять и открыть чат"
      pending={pending}
      error={error}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  )
}
