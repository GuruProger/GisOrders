import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router'
import type { Order, Proposal } from '@/api/types'
import { server } from '@/test/msw'
import { TestProviders } from '@/test/providers'
import { ProposalList } from './ProposalList'

const order: Order = {
  id: 1,
  title: 'Спилить сухое дерево',
  description: 'Дерево во дворе',
  min_price: 2000,
  max_price: 3500,
  deadline: '2027-12-01T10:00:00Z',
  address: 'Москва, ул. Лесная, 1',
  tree_type: 'сосна',
  tree_height: 12,
  tree_diameter: 35,
  photos: null,
  status: 'open',
  created_at: '2026-10-01T10:00:00Z',
  closed_at: null,
  customer_id: 3,
  accepted_proposal_id: null,
  lat: 55.751,
  lon: 37.618,
  proposals_count: 1,
}

const pendingProposal: Proposal = {
  id: 5,
  proposed_price: 2800,
  message: 'Работаю аккуратно',
  created_at: '2026-10-30T12:00:00Z',
  order_id: 1,
  executor_id: 2,
  status: 'pending',
}

function renderList(onAccepted = vi.fn()) {
  return render(
    <TestProviders initialEntries={['/orders/1']}>
      <Routes>
        <Route
          path="/orders/1"
          element={
            <ProposalList order={order} proposals={[pendingProposal]} onAccepted={onAccepted} />
          }
        />
        <Route path="/chats" element={<p>Чаты</p>} />
      </Routes>
    </TestProviders>,
  )
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

beforeEach(() => {
  server.use(
    http.get('/api/v1/users/2', () => HttpResponse.json({ id: 2, username: 'Иван' })),
  )
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => server.close())

test('accept asks for confirmation and warns that others will be rejected', async () => {
  const onAccepted = vi.fn()
  let accepted = 0
  server.use(
    http.post('/api/v1/orders/1/proposals/5/accept', () => {
      accepted += 1
      return HttpResponse.json({ ...pendingProposal, status: 'accepted' })
    }),
  )

  renderList(onAccepted)

  expect(await screen.findByText('Иван')).toBeInTheDocument()
  expect(screen.getByText('2 800 ₽')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Принять' }))

  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText(/исполнителя Иван/)).toBeInTheDocument()
  expect(within(dialog).getByText(/Остальные отклики будут отклонены/)).toBeInTheDocument()

  await userEvent.click(within(dialog).getByRole('button', { name: 'Принять и открыть чат' }))

  await vi.waitFor(() => expect(onAccepted).toHaveBeenCalledTimes(1))
  expect(accepted).toBe(1)
  expect(await screen.findByText('Чаты')).toBeInTheDocument()
})

test('conflict error is explained', async () => {
  const onAccepted = vi.fn()
  server.use(
    http.post('/api/v1/orders/1/proposals/5/accept', () =>
      HttpResponse.json(
        { detail: 'Исполнитель уже выбран или заказ закрыт', error_code: 'order_not_open' },
        { status: 409 },
      ),
    ),
  )

  renderList(onAccepted)

  await screen.findByText('Иван')
  await userEvent.click(screen.getByRole('button', { name: 'Принять' }))
  await userEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Принять и открыть чат' }),
  )

  const dialog = screen.getByRole('dialog')
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Исполнитель уже выбран или заказ закрыт',
  )
  expect(onAccepted).not.toHaveBeenCalled()
})

test('assigned orders no longer offer the accept action', async () => {
  render(
    <TestProviders initialEntries={['/orders/1']}>
      <ProposalList
        order={{ ...order, status: 'assigned' }}
        proposals={[pendingProposal]}
        onAccepted={vi.fn()}
      />
    </TestProviders>,
  )

  await screen.findByText('Иван')
  expect(screen.queryByRole('button', { name: 'Принять' })).not.toBeInTheDocument()
})
