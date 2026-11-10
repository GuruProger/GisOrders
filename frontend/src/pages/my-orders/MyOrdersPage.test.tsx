import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import type { Order, Proposal } from '@/api/types'
import { setRoleMode } from '@/features/switch-role/model'
import { server } from '@/test/msw'
import { TestProviders } from '@/test/providers'
import { MyOrdersPage } from './MyOrdersPage'

const baseOrder: Order = {
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
  customer_id: 2,
  accepted_proposal_id: null,
  lat: 55.751,
  lon: 37.618,
  proposals_count: 0,
}

const openOrder = { ...baseOrder, id: 1, title: 'Открытый заказ', proposals_count: 2 }
const freshOrder = { ...baseOrder, id: 4, title: 'Свежий заказ', proposals_count: 0 }
const assignedOrder = {
  ...baseOrder,
  id: 2,
  title: 'Заказ в работе',
  status: 'assigned' as const,
  accepted_proposal_id: 11,
  proposals_count: 0,
}
const closedOrder = {
  ...baseOrder,
  id: 3,
  title: 'Закрытый заказ',
  status: 'closed' as const,
  closed_at: '2026-10-20T10:00:00Z',
  proposals_count: 0,
}

function proposalFor(order: Order, status: Proposal['status'], id: number): Proposal & { order: Order } {
  return {
    id,
    proposed_price: 2800,
    message: null,
    created_at: '2026-10-20T12:00:00Z',
    order_id: order.id,
    executor_id: 2,
    status,
    order,
  }
}

function renderPage() {
  return render(
    <TestProviders initialEntries={['/my/orders']}>
      <MyOrdersPage />
    </TestProviders>,
  )
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

beforeEach(() => {
  localStorage.clear()
  setRoleMode('customer')
  server.use(http.get('/api/v1/orders/my', () => HttpResponse.json([])))
})

afterEach(() => {
  server.resetHandlers()
  localStorage.clear()
})

afterAll(() => server.close())

test('customer orders are grouped by status with proposal counters', async () => {
  server.use(
    http.get('/api/v1/orders/my', () =>
      HttpResponse.json([openOrder, freshOrder, assignedOrder, closedOrder]),
    ),
  )

  renderPage()

  expect(await screen.findByText('Открытый заказ')).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: 'Открытые' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: 'В работе' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: 'Закрытые' })).toBeInTheDocument()
  expect(screen.getByText('2 отклика')).toBeInTheDocument()
  expect(screen.getByText('Пока нет откликов')).toBeInTheDocument()
  // A zero pending count on a non-open order must not read as a fresh order.
  expect(screen.queryByText('Новый заказ')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Открытый заказ' })).toHaveAttribute('href', '/orders/1')
})

test('customer without orders is prompted to create one first', async () => {
  renderPage()

  expect(await screen.findByText('Пока нет заказов')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Создать заказ' })).toHaveAttribute('href', '/orders/new')
  expect(screen.getByRole('link', { name: 'К ленте' })).toHaveAttribute('href', '/')
})

test('executor mode shows accepted works grouped into in-progress and finished', async () => {
  setRoleMode('executor')
  server.use(
    http.get('/api/v1/orders/proposals/my', () =>
      HttpResponse.json([
        proposalFor(assignedOrder, 'accepted', 11),
        proposalFor(closedOrder, 'accepted', 12),
        proposalFor(openOrder, 'pending', 13),
      ]),
    ),
  )

  renderPage()

  expect(await screen.findByText('Заказ в работе')).toBeInTheDocument()
  expect(screen.getByText('Закрытый заказ')).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: 'В работе' })).toBeInTheDocument()
  expect(screen.getByRole('heading', { level: 2, name: 'Завершённые' })).toBeInTheDocument()
  expect(screen.queryByText('Открытый заказ')).not.toBeInTheDocument()
  expect(screen.getAllByText('2 800 ₽')).toHaveLength(2)
})

test('executor without accepted works sees a hint', async () => {
  setRoleMode('executor')
  server.use(http.get('/api/v1/orders/proposals/my', () => HttpResponse.json([])))

  renderPage()

  expect(await screen.findByText('Пока нет работ')).toBeInTheDocument()
})
