import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Proposal } from '@/api/types'
import { server } from '@/test/msw'
import { TestProviders } from '@/test/providers'
import { ProposalForm } from './ProposalForm'

const createdProposal: Proposal = {
  id: 20,
  proposed_price: 2500,
  message: null,
  created_at: '2026-10-31T12:00:00Z',
  order_id: 1,
  executor_id: 2,
  status: 'pending',
}

const DAILY_LIMIT_MESSAGE = 'Превышен лимит откликов за день. Максимум 3 отклика в сутки'

function renderForm(onCreated?: () => void) {
  return render(
    <TestProviders>
      <ProposalForm orderId={1} maxPrice={3500} onCreated={onCreated} />
    </TestProviders>,
  )
}

const priceInput = () => screen.getByLabelText('Ваша цена')
const messageInput = () => screen.getByLabelText('Сообщение')
const submitButton = () => screen.getByRole('button', { name: 'Откликнуться' })

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

afterEach(() => server.resetHandlers())

afterAll(() => server.close())

test('rejects zero price before sending', async () => {
  let posts = 0
  server.use(
    http.post('/api/v1/orders/1/proposals', () => {
      posts += 1
      return HttpResponse.json(createdProposal)
    }),
  )

  renderForm()

  await userEvent.type(priceInput(), '0')
  await userEvent.click(submitButton())

  expect(await screen.findByText('Цена должна быть больше нуля')).toBeInTheDocument()
  expect(posts).toBe(0)
})

test('sends price and message and calls onCreated', async () => {
  let body: unknown = null
  server.use(
    http.post('/api/v1/orders/1/proposals', async ({ request }) => {
      body = await request.json()
      return HttpResponse.json({ ...createdProposal, message: 'Могу убрать быстро' })
    }),
  )
  const onCreated = vi.fn()

  renderForm(onCreated)

  await userEvent.type(priceInput(), '2500')
  await userEvent.type(messageInput(), 'Могу убрать быстро')
  await userEvent.click(submitButton())

  await vi.waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
  expect(body).toEqual({ proposed_price: 2500, message: 'Могу убрать быстро' })
  // jest-dom reports an empty number input as `null`.
  expect(priceInput()).toHaveValue(null)
  expect(messageInput()).toHaveValue('')
})

test('blocks the submit button while the request is in flight', async () => {
  server.use(
    http.post('/api/v1/orders/1/proposals', async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
      return HttpResponse.json(createdProposal)
    }),
  )

  renderForm()

  await userEvent.type(priceInput(), '2500')
  await userEvent.click(submitButton())

  await vi.waitFor(() => expect(submitButton()).toBeDisabled())
  await vi.waitFor(() => expect(priceInput()).toHaveValue(null))
})

test('shows daily limit message from api', async () => {
  server.use(
    http.post('/api/v1/orders/1/proposals', () =>
      HttpResponse.json(
        { detail: DAILY_LIMIT_MESSAGE, error_code: 'daily_proposal_limit' },
        { status: 429 },
      ),
    ),
  )

  renderForm()

  await userEvent.type(priceInput(), '2500')
  await userEvent.click(submitButton())

  expect(await screen.findByRole('alert')).toHaveTextContent(DAILY_LIMIT_MESSAGE)
  expect(priceInput()).toHaveValue(2500)
})
