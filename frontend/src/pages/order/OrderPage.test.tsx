import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router'
import type { Order, User } from '@/api/types'
import { useSession } from '@/features/auth/session'
import { setRoleMode } from '@/features/switch-role/model'
import { server } from '@/test/msw'
import { TestProviders } from '@/test/providers'
import { OrderPage } from './OrderPage'

vi.mock('react-leaflet', () => import('@/test/mapMocks'))
vi.mock('@/widgets/map/MarkerClusterGroup', () => import('@/test/mapMocks'))

const user: User = {
  id: 2,
  email: 'customer@example.com',
  username: 'customer',
  phone_number: null,
  is_admin: false,
  is_active: true,
}

const order: Order = {
  id: 1,
  title: 'Спилить сухое дерево',
  description: 'Дерево во дворе, нужен аккуратный спил.',
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
  customer_id: user.id,
  accepted_proposal_id: null,
  lat: 55.751,
  lon: 37.618,
  proposals_count: 0,
}

function serveOrder(value: Order): void {
  server.use(http.get('/api/v1/orders/1', () => HttpResponse.json(value)))
}

function renderOrder() {
  return render(
    <TestProviders initialEntries={['/orders/1']}>
      <Routes>
        <Route path="/orders/:id" element={<OrderPage />} />
        <Route path="/" element={<p>Лента</p>} />
        <Route path="/my/orders" element={<p>Мои заказы</p>} />
      </Routes>
    </TestProviders>,
  )
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

beforeEach(() => {
  localStorage.clear()
  setRoleMode('customer')
  useSession.setState({ user, status: 'authenticated' })
})

afterEach(() => {
  server.resetHandlers()
  useSession.getState().clear()
  localStorage.clear()
})

afterAll(() => server.close())

test('own open order shows edit and close actions', async () => {
  serveOrder(order)

  renderOrder()

  await screen.findByRole('heading', { name: order.title })

  expect(screen.getByRole('button', { name: 'Редактировать' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Закрыть заказ' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Удалить' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Откликнуться' })).not.toBeInTheDocument()
  expect(document.title).toContain(order.title)
})

test('other user open order shows respond action in executor mode', async () => {
  serveOrder({ ...order, customer_id: 99 })
  setRoleMode('executor')

  renderOrder()

  await screen.findByRole('heading', { name: order.title })

  expect(screen.getByRole('button', { name: 'Откликнуться' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Закрыть заказ' })).not.toBeInTheDocument()
})

test('customer mode of another user suggests switching roles', async () => {
  serveOrder({ ...order, customer_id: 99 })

  renderOrder()

  await screen.findByRole('heading', { name: order.title })

  expect(screen.getByText(/режиме заказчика/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Перейти в режим исполнителя' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Откликнуться' })).not.toBeInTheDocument()
})

test('assigned order hides respond and shows the executor is chosen', async () => {
  serveOrder({ ...order, customer_id: 99, status: 'assigned', accepted_proposal_id: 5 })
  setRoleMode('executor')

  renderOrder()

  await screen.findByText('Исполнитель выбран')

  expect(screen.queryByRole('button', { name: 'Откликнуться' })).not.toBeInTheDocument()
  expect(screen.getByText('В работе')).toBeInTheDocument()
})

test('closed order shows closed badge and dates', async () => {
  serveOrder({
    ...order,
    customer_id: 99,
    status: 'closed',
    closed_at: '2026-11-15T10:00:00Z',
  })

  renderOrder()

  await screen.findByRole('heading', { name: order.title })

  expect(screen.getAllByText('Закрыт').length).toBeGreaterThan(0)
  expect(screen.getByText('15 нояб')).toBeInTheDocument()
  expect(screen.getByText('Опубликован 1 окт')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Откликнуться' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Закрыть заказ' })).not.toBeInTheDocument()
})

test('closing the order asks for confirmation and calls the api', async () => {
  serveOrder(order)
  let posted = 0
  server.use(
    http.post('/api/v1/orders/1/close', () => {
      posted += 1
      return HttpResponse.json({ ...order, status: 'closed', closed_at: '2026-10-31T10:00:00Z' })
    }),
  )

  renderOrder()

  await screen.findByRole('heading', { name: order.title })
  await userEvent.click(screen.getByRole('button', { name: 'Закрыть заказ' }))

  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText('Заказ будет закрыт. Продолжить?')).toBeInTheDocument()

  await userEvent.click(within(dialog).getByRole('button', { name: 'Закрыть заказ' }))

  expect(posted).toBe(1)
  expect(await screen.findByText('Заказ закрыт')).toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('deleting the order asks for confirmation and navigates to my orders', async () => {
  serveOrder(order)
  let deleted = 0
  server.use(
    http.delete('/api/v1/orders/1', () => {
      deleted += 1
      return new HttpResponse(null, { status: 204 })
    }),
  )

  renderOrder()

  await screen.findByRole('heading', { name: order.title })
  await userEvent.click(screen.getByRole('button', { name: 'Удалить' }))

  const dialog = screen.getByRole('dialog')
  expect(
    within(dialog).getByText('Заказ будет удалён без возможности восстановления.'),
  ).toBeInTheDocument()

  await userEvent.click(within(dialog).getByRole('button', { name: 'Удалить' }))

  expect(deleted).toBe(1)
  expect(await screen.findByText('Мои заказы')).toBeInTheDocument()
  expect(screen.getByText('Заказ удалён')).toBeInTheDocument()
})

test('missing order shows a not-found state', async () => {
  server.use(
    http.get('/api/v1/orders/1', () =>
      HttpResponse.json({ detail: 'Заказ не найден', error_code: 'order_not_found' }, { status: 404 }),
    ),
  )

  renderOrder()

  expect(await screen.findByText('Заказ не найден')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'К ленте' })).toBeInTheDocument()
})
