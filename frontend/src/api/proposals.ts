import { apiRequest } from './client'
import type { Order, Proposal } from './types'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** A proposal of `mine` comes with the order snapshot so cards can render titles. */
export type ProposalWithOrder = Proposal & { order: Order }

export interface ProposalInput {
  proposed_price: number
  message?: string
}

/** Proposals created by the current executor; each carries its `order`. */
export async function fetchMyProposals(): Promise<ProposalWithOrder[]> {
  const { data } = await apiRequest<ProposalWithOrder[]>('/orders/proposals/my')
  return data
}

export async function createProposal(orderId: number, input: ProposalInput): Promise<Proposal> {
  const { data } = await apiRequest<Proposal>(`/orders/${orderId}/proposals`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      proposed_price: input.proposed_price,
      ...(input.message ? { message: input.message } : {}),
    }),
  })
  return data
}

/** Withdraw is allowed while the proposal is `pending`; the backend replies 409 otherwise. */
export async function withdrawProposal(proposalId: number): Promise<void> {
  await apiRequest<null>(`/orders/proposals/${proposalId}`, { method: 'DELETE' })
}
