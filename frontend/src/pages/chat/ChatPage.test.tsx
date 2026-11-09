import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router'
import type { Chat, Message, User } from '@/api/types'
import { useSession } from '@/features/auth/session'
import { FakeWebSocket, installFakeWebSocket, uninstallFakeWebSocket } from '@/test/fakeSocket'
import { server } from '@/test/msw'
import { TestProviders } from '@/test/providers'
import { ChatPage } from './ChatPage'

const user: User = {
  id: 2,
  email: 'customer@example.com',
  username: 'customer',
  phone_number: null,
  is_admin: false,
  is_active: true,
}

function localIso(dayOffset: number, hour: number, minute = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + dayOffset)
  date.setHours(hour, minute, 0, 0)
  return date.toISOString()
}

const chat: Chat & { messages: Message[] } = {
  id: 1,
  order_id: 42,
  customer_id: user.id,
  executor_id: 3,
  proposal_id: 7,
  is_active: true,
  created_at: localIso(-2, 9),
  updated_at: localIso(0, 9),
  last_message: 'Когда сможете приехать?',
  unread_count: 1,
  messages: [
    {
      id: 1,
      chat_id: 1,
      sender_id: 3,
      text: 'Добрый день',
      is_read: true,
      created_at: localIso(-1, 10),
    },
    {
      id: 2,
      chat_id: 1,
      sender_id: user.id,
      text: 'Здравствуйте',
      is_read: true,
      created_at: localIso(-1, 10, 5),
    },
    {
      id: 3,
      chat_id: 1,
      sender_id: 3,
      text: 'Когда сможете приехать?',
      is_read: false,
      created_at: localIso(0, 9),
    },
  ],
}

function serveDefaults(): void {
  server.use(
    http.get('/api/v1/chats/1', () => HttpResponse.json(chat)),
    http.get('/api/v1/users/3', () => HttpResponse.json({ id: 3, username: 'Иван' })),
    http.post('/api/v1/chats/1/read', () => HttpResponse.json({ message: 'Отмечено 1 сообщений' })),
  )
}

function renderPage() {
  return render(
    <TestProviders initialEntries={['/chats/1']}>
      <Routes>
        <Route path="/chats/:id" element={<ChatPage />} />
        <Route path="/chats" element={<p>Чаты</p>} />
        <Route path="/orders/:id" element={<p>Заказ</p>} />
      </Routes>
    </TestProviders>,
  )
}

/** Opens the first socket and authenticates it, like the backend would. */
function openSocket(): FakeWebSocket {
  const socket = FakeWebSocket.last()
  act(() => {
    socket.open()
    socket.receive({ type: 'auth.ok', chat_id: 1, user_id: user.id })
  })
  return socket
}

function bubble(text: string): HTMLElement {
  const element = screen.getByText(text).closest<HTMLElement>('[data-own]')
  if (!element) throw new Error(`Bubble for "${text}" not found`)
  return element
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

beforeEach(() => {
  localStorage.clear()
  useSession.setState({ user, status: 'authenticated' })
  installFakeWebSocket()
  serveDefaults()
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
  useSession.getState().clear()
  localStorage.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
  uninstallFakeWebSocket()
})

afterAll(() => server.close())

test('sends optimistically and removes the message when the api fails', async () => {
  server.use(
    http.post('/api/v1/chats/1/messages', async () => {
      await new Promise((resolve) => setTimeout(resolve, 80))
      return HttpResponse.json({ detail: 'Ошибка сервера' }, { status: 500 })
    }),
  )

  renderPage()
  await screen.findByText('Иван')
  openSocket()

  await userEvent.type(screen.getByLabelText('Сообщение'), 'Новое сообщение')
  await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))

  expect(screen.getByText('Новое сообщение')).toBeInTheDocument()

  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось отправить')
  expect(screen.queryByText('Новое сообщение')).not.toBeInTheDocument()
})

test('groups messages by day and renders own messages on the right', async () => {
  renderPage()
  await screen.findByText('Иван')
  openSocket()

  expect(screen.getByText('Вчера')).toBeInTheDocument()
  expect(screen.getByText('Сегодня')).toBeInTheDocument()

  expect(bubble('Здравствуйте')).toHaveAttribute('data-own', 'true')
  expect(bubble('Здравствуйте')).toHaveClass('bg-moss-600')
  expect(bubble('Добрый день')).toHaveAttribute('data-own', 'false')
  expect(bubble('Добрый день')).toHaveClass('bg-card')

  expect(screen.getByRole('link', { name: 'К заказу' })).toHaveAttribute('href', '/orders/42')
  await vi.waitFor(() => expect(document.title).toBe('Иван — GisOrders'))
})

test('shows the offline banner and reconnects after a drop', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5)

  renderPage()
  await screen.findByText('Иван')
  const first = openSocket()

  expect(screen.queryByText('Нет связи, переподключаемся')).not.toBeInTheDocument()

  act(() => {
    first.serverClose(1006)
  })

  expect(await screen.findByText('Нет связи, переподключаемся')).toBeInTheDocument()

  await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2), { timeout: 3000 })
  const second = FakeWebSocket.last()
  act(() => {
    second.open()
    second.receive({ type: 'auth.ok', chat_id: 1, user_id: user.id })
  })

  await vi.waitFor(() =>
    expect(screen.queryByText('Нет связи, переподключаемся')).not.toBeInTheDocument(),
  )
})

test('shows the typing indicator and fades it after three seconds', async () => {
  renderPage()
  await screen.findByText('Иван')
  const socket = openSocket()

  vi.useFakeTimers()
  act(() => {
    socket.receive({ type: 'typing', chat_id: 1, user_id: 3, is_typing: true })
  })

  expect(screen.getByText('печатает…')).toBeInTheDocument()

  act(() => {
    vi.advanceTimersByTime(3000)
  })

  expect(screen.queryByText('печатает…')).not.toBeInTheDocument()
  vi.useRealTimers()
})

test('deduplicates the socket echo of a sent message', async () => {
  const saved: Message = {
    id: 77,
    chat_id: 1,
    sender_id: user.id,
    text: 'Повтор',
    is_read: false,
    created_at: localIso(0, 11),
  }
  server.use(
    http.post('/api/v1/chats/1/messages', () => HttpResponse.json(saved)),
  )

  renderPage()
  await screen.findByText('Иван')
  const socket = openSocket()

  await userEvent.type(screen.getByLabelText('Сообщение'), 'Повтор')
  await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))

  expect(await screen.findByText('Повтор')).toBeInTheDocument()

  act(() => {
    socket.receive({ type: 'message.created', message: saved })
  })

  expect(screen.getAllByText('Повтор')).toHaveLength(1)
})

test('a message from the other participant appears without a reload', async () => {
  renderPage()
  await screen.findByText('Иван')
  const socket = openSocket()

  act(() => {
    socket.receive({
      type: 'message.created',
      message: {
        id: 90,
        chat_id: 1,
        sender_id: 3,
        text: 'Я на месте',
        is_read: false,
        created_at: localIso(0, 12),
      },
    })
  })

  expect(screen.getByText('Я на месте')).toBeInTheDocument()
})

test('a permanent access error is shown instead of the reconnect banner', async () => {
  renderPage()
  await screen.findByText('Иван')
  const socket = openSocket()

  act(() => {
    socket.serverClose(4403)
  })

  expect(await screen.findByRole('alert')).toHaveTextContent('Нет доступа к чату')
  expect(screen.queryByText('Нет связи, переподключаемся')).not.toBeInTheDocument()
})
