import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router'
import type { Order, Proposal, User } from '@/api/types'
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

/** Serves whatever the executor's proposals list currently is (mutable via `list`). */
function serveMyProposals(list: () => (Proposal & { order: Order })[]): void {
  server.use(http.get('/api/v1/orders/proposals/my', () => HttpResponse.json(list())))
}

const myPendingProposal: Proposal & { order: Order } = {
  id: 30,
  proposed_price: 2800,
  message: 'Работаю аккуратно',
  created_at: '2026-10-30T12:00:00Z',
  order_id: 1,
  executor_id: user.id,
  status: 'pending',
  order,
}

function renderOrder() {
  return render(
    <TestProviders initialEntries={['/orders/1']}>
      <Routes>
        <Route path="/orders/:id" element={<OrderPage />} />
        <Route path="/" element={<p>Лента</p>} />
        <Route path="/my/orders" element={<p>Мои заказы</p>} />
        <Route path="/chats" element={<p>Чаты</p>} />
      </Routes>
    </TestProviders>,
  )
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

beforeEach(() => {
  localStorage.clear()
  setRoleMode('customer')
  useSession.setState({ user, status: 'authenticated' })
  // Owner pages now load the proposals section.
  server.use(http.get('/api/v1/orders/1/proposals', () => HttpResponse.json([])))
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
  serveMyProposals(() => [])
  setRoleMode('executor')

  renderOrder()

  await screen.findByRole('heading', { name: order.title })

  expect(await screen.findByRole('button', { name: 'Откликнуться' })).toBeInTheDocument()
  expect(screen.getByLabelText('Ваша цена')).toBeInTheDocument()
  expect(screen.getByText('Вилка заказчика: до 3 500 ₽')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Закрыть заказ' })).not.toBeInTheDocument()
})

test('executor creates a proposal and the form swaps to the status card', async () => {
  let detailFetches = 0
  let proposals: (Proposal & { order: Order })[] = []
  let created = 0
  server.use(
    http.get('/api/v1/orders/1', () => {
      detailFetches += 1
      return HttpResponse.json({ ...order, customer_id: 99 })
    }),
    http.get('/api/v1/orders/proposals/my', () => HttpResponse.json(proposals)),
    http.post('/api/v1/orders/1/proposals', async ({ request }) => {
      created += 1
      const body = (await request.json()) as { proposed_price: number }
      proposals = [
        {
          ...myPendingProposal,
          proposed_price: body.proposed_price,
          message: null,
          order: { ...order, customer_id: 99 },
        },
      ]
      return HttpResponse.json(proposals[0])
    }),
  )
  setRoleMode('executor')

  renderOrder()

  await screen.findByRole('button', { name: 'Откликнуться' })
  const fetchesBefore = detailFetches

  await userEvent.type(screen.getByLabelText('Ваша цена'), '2800')
  await userEvent.click(screen.getByRole('button', { name: 'Откликнуться' }))

  expect(created).toBe(1)
  expect(await screen.findByText('Ваш отклик')).toBeInTheDocument()
  expect(screen.getByText('Ожидает')).toBeInTheDocument()
  expect(screen.getByText('2 800 ₽')).toBeInTheDocument()
  expect(screen.queryByLabelText('Ваша цена')).not.toBeInTheDocument()
  // The detail query is invalidated and refreshed instead of reloading the page.
  expect(detailFetches).toBeGreaterThan(fetchesBefore)
})

test('executor sees own pending proposal and can withdraw it', async () => {
  let proposals: (Proposal & { order: Order })[] = [myPendingProposal]
  let deleted = 0
  server.use(
    http.get('/api/v1/orders/1', () => HttpResponse.json({ ...order, customer_id: 99 })),
    http.get('/api/v1/orders/proposals/my', () => HttpResponse.json(proposals)),
    http.delete('/api/v1/orders/proposals/30', () => {
      deleted += 1
      proposals = []
      return new HttpResponse(null, { status: 204 })
    }),
  )
  setRoleMode('executor')

  renderOrder()

  await screen.findByRole('heading', { name: order.title })

  expect(await screen.findByText('Ваш отклик')).toBeInTheDocument()
  expect(screen.getByText('2 800 ₽')).toBeInTheDocument()
  expect(screen.getByText('Работаю аккуратно')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Отозвать' }))
  const dialog = screen.getByRole('dialog')
  expect(
    within(dialog).getByText('Отклик на «Спилить сухое дерево» будет отозван. Продолжить?'),
  ).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Отозвать' }))

  expect(deleted).toBe(1)
  expect(await screen.findByRole('button', { name: 'Откликнуться' })).toBeInTheDocument()
})

test('proposal lookup failure shows a retry instead of the form', async () => {
  let requests = 0
  server.use(
    http.get('/api/v1/orders/1', () => HttpResponse.json({ ...order, customer_id: 99 })),
    http.get('/api/v1/orders/proposals/my', () => {
      requests += 1
      return HttpResponse.json({ detail: 'Ошибка сервера' }, { status: 500 })
    }),
  )
  setRoleMode('executor')

  renderOrder()

  await screen.findByRole('heading', { name: order.title })
  expect(
    await screen.findByText('Не удалось проверить ваш отклик на этот заказ.'),
  ).toBeInTheDocument()
  expect(screen.queryByLabelText('Ваша цена')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
  await vi.waitFor(() => expect(requests).toBeGreaterThanOrEqual(2))
})

test('owner order page never fetches my proposals', async () => {
  serveOrder(order)
  let proposalFetches = 0
  serveMyProposals(() => {
    proposalFetches += 1
    return []
  })
  setRoleMode('executor')

  renderOrder()

  await screen.findByRole('heading', { name: order.title })
  expect(screen.getByRole('button', { name: 'Редактировать' })).toBeInTheDocument()
  expect(proposalFetches).toBe(0)
})

test('owner sees proposals and accepts one after confirmation', async () => {
  serveOrder(order)
  const ownProposal: Proposal = {
    id: 5,
    proposed_price: 2800,
    message: 'Работаю аккуратно',
    created_at: '2026-10-30T12:00:00Z',
    order_id: 1,
    executor_id: 2,
    status: 'pending',
  }
  server.use(
    http.get('/api/v1/orders/1/proposals', () => HttpResponse.json([ownProposal])),
    http.get('/api/v1/users/2', () => HttpResponse.json({ id: 2, username: 'Иван' })),
    http.post('/api/v1/orders/1/proposals/5/accept', () =>
      HttpResponse.json({ ...ownProposal, status: 'accepted' }),
    ),
  )

  renderOrder()

  await screen.findByRole('heading', { name: order.title })
  expect(await screen.findByText('Иван')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Отклики' })).toBeInTheDocument()
  expect(screen.getByText('2 800 ₽')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Принять' }))

  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText(/Остальные отклики будут отклонены/)).toBeInTheDocument()

  await userEvent.click(within(dialog).getByRole('button', { name: 'Принять и открыть чат' }))

  expect(await screen.findByText('Чаты')).toBeInTheDocument()
  expect(screen.getByText('Исполнитель выбран')).toBeInTheDocument()
})

test('accept conflict explains the error and refetches the proposals', async () => {
  serveOrder(order)
  const ownProposal: Proposal = {
    id: 5,
    proposed_price: 2800,
    message: null,
    created_at: '2026-10-30T12:00:00Z',
    order_id: 1,
    executor_id: 2,
    status: 'pending',
  }
  let fetches = 0
  server.use(
    http.get('/api/v1/orders/1/proposals', () => {
      fetches += 1
      return HttpResponse.json([ownProposal])
    }),
    http.get('/api/v1/users/2', () => HttpResponse.json({ id: 2, username: 'Иван' })),
    http.post('/api/v1/orders/1/proposals/5/accept', () =>
      HttpResponse.json(
        { detail: 'Исполнитель уже выбран или заказ закрыт', error_code: 'order_not_open' },
        { status: 409 },
      ),
    ),
  )

  renderOrder()

  await screen.findByRole('heading', { name: order.title })
  await screen.findByText('Иван')
  await userEvent.click(screen.getByRole('button', { name: 'Принять' }))
  await userEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Принять и открыть чат' }),
  )

  const dialog = screen.getByRole('dialog')
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Исполнитель уже выбран или заказ закрыт',
  )
  await vi.waitFor(() => expect(fetches).toBeGreaterThanOrEqual(2))
})

test('executor of an assigned order sees the accepted status and the chat link', async () => {
  serveOrder({ ...order, customer_id: 99, status: 'assigned', accepted_proposal_id: 30 })
  serveMyProposals(() => [{ ...myPendingProposal, status: 'accepted' }])
  setRoleMode('executor')

  renderOrder()

  await screen.findByRole('heading', { name: order.title })

  expect(await screen.findByText('Ваш отклик')).toBeInTheDocument()
  expect(screen.getByText('Принят')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Перейти в чат' })).toHaveAttribute('href', '/chats')
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
  let current = order
  let posted = 0
  server.use(
    http.get('/api/v1/orders/1', () => HttpResponse.json(current)),
    http.post('/api/v1/orders/1/close', () => {
      posted += 1
      current = { ...order, status: 'closed', closed_at: '2026-10-31T10:00:00Z' }
      return HttpResponse.json(current)
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
  expect(await screen.findByText('31 окт')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Редактировать' })).not.toBeInTheDocument()
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
