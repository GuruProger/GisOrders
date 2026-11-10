import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router'
import type { Order, Proposal } from '@/api/types'
import { formatShortDate } from '@/shared/lib/format'
import { server } from '@/test/msw'
import { TestProviders } from '@/test/providers'
import { MyProposalsPage } from './MyProposalsPage'

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

const pendingProposal: Proposal & { order: Order } = {
  id: 11,
  proposed_price: 2500,
  message: 'Могу приехать завтра',
  created_at: '2026-10-20T12:00:00Z',
  order_id: 1,
  executor_id: 2,
  status: 'pending',
  order,
}

const acceptedProposal: Proposal & { order: Order } = {
  id: 12,
  proposed_price: 2700,
  message: null,
  created_at: '2026-10-21T12:00:00Z',
  order_id: 2,
  executor_id: 2,
  status: 'accepted',
  order: { ...order, id: 2, title: 'Убрать ветки после спила' },
}

const rejectedProposal: Proposal & { order: Order } = {
  id: 13,
  proposed_price: 3000,
  message: null,
  created_at: '2026-10-22T12:00:00Z',
  order_id: 3,
  executor_id: 2,
  status: 'rejected',
  order: { ...order, id: 3, title: 'Частичная обрезка кроны' },
}

let current: (Proposal & { order: Order })[] = []

function renderPage() {
  return render(
    <TestProviders initialEntries={['/my/proposals']}>
      <Routes>
        <Route path="/my/proposals" element={<MyProposalsPage />} />
        <Route path="/orders/:id" element={<p>Заказ</p>} />
        <Route path="/chats" element={<p>Чаты</p>} />
        <Route path="/" element={<p>Лента</p>} />
      </Routes>
    </TestProviders>,
  )
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

beforeEach(() => {
  current = []
  server.use(http.get('/api/v1/orders/proposals/my', () => HttpResponse.json(current)))
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => server.close())

test('renders the list with prices, statuses and dates', async () => {
  current = [pendingProposal, acceptedProposal, rejectedProposal]

  renderPage()

  expect(await screen.findByRole('link', { name: 'Спилить сухое дерево' })).toHaveAttribute(
    'href',
    '/orders/1',
  )
  expect(screen.getByText('2 500 ₽')).toBeInTheDocument()
  expect(screen.getByText('Ожидает')).toBeInTheDocument()
  expect(screen.getByText('Принят')).toBeInTheDocument()
  expect(screen.getByText('Отклонён')).toBeInTheDocument()
  expect(
    screen.getByText(`Оставлен ${formatShortDate('2026-10-20T12:00:00Z')}`),
  ).toBeInTheDocument()
})

test('pending proposals can be withdrawn, accepted ones link to chat, rejected has no action', async () => {
  current = [pendingProposal, acceptedProposal, rejectedProposal]

  renderPage()

  const withdrawButtons = await screen.findAllByRole('button', { name: 'Отозвать' })
  expect(withdrawButtons).toHaveLength(1)
  expect(screen.getByRole('link', { name: 'Перейти в чат' })).toHaveAttribute('href', '/chats')

  const rejectedCard = screen.getByText('Частичная обрезка кроны').closest('li')
  expect(rejectedCard).not.toBeNull()
  if (!rejectedCard) throw new Error('rejected card not found')
  expect(within(rejectedCard).queryByRole('button', { name: 'Отозвать' })).not.toBeInTheDocument()
  expect(within(rejectedCard).queryByRole('link', { name: 'Перейти в чат' })).not.toBeInTheDocument()
})

test('withdrawing asks for confirmation, calls the api and refreshes', async () => {
  current = [pendingProposal, acceptedProposal]
  let deleted = 0
  server.use(
    http.delete('/api/v1/orders/proposals/11', () => {
      deleted += 1
      current = [acceptedProposal]
      return new HttpResponse(null, { status: 204 })
    }),
  )

  renderPage()

  await screen.findByRole('button', { name: 'Отозвать' })
  await userEvent.click(screen.getByRole('button', { name: 'Отозвать' }))

  const dialog = screen.getByRole('dialog')
  expect(
    within(dialog).getByText('Отклик на «Спилить сухое дерево» будет отозван. Продолжить?'),
  ).toBeInTheDocument()

  await userEvent.click(within(dialog).getByRole('button', { name: 'Отозвать' }))

  expect(deleted).toBe(1)
  expect(await screen.findByText('Отклик отозван')).toBeInTheDocument()
  await vi.waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Отозвать' })).not.toBeInTheDocument(),
  )
  expect(screen.getByRole('link', { name: 'Перейти в чат' })).toBeInTheDocument()
})

test('withdraw errors are shown inside the dialog', async () => {
  current = [pendingProposal]
  server.use(
    http.delete('/api/v1/orders/proposals/11', () =>
      HttpResponse.json(
        { detail: 'Отозвать можно только отклик в статусе ожидания', error_code: 'proposal_not_pending' },
        { status: 409 },
      ),
    ),
  )

  renderPage()

  await screen.findByRole('button', { name: 'Отозвать' })
  await userEvent.click(screen.getByRole('button', { name: 'Отозвать' }))
  await userEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Отозвать' }),
  )

  const dialog = screen.getByRole('dialog')
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Отозвать можно только отклик в статусе ожидания',
  )
  expect(screen.getByText('2 500 ₽')).toBeInTheDocument()
})

test('an empty list shows the hint with a link to the feed', async () => {
  current = []

  renderPage()

  expect(await screen.findByText('Вы ещё не откликались')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'К ленте' })).toHaveAttribute('href', '/')
})

test('a failed load offers a retry', async () => {
  let requests = 0
  server.use(
    http.get('/api/v1/orders/proposals/my', () => {
      requests += 1
      return HttpResponse.json({ detail: 'Ошибка сервера' }, { status: 500 })
    }),
  )

  renderPage()

  expect(await screen.findByText('Не удалось загрузить отклики')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
  await vi.waitFor(() => expect(requests).toBeGreaterThanOrEqual(2))
})
