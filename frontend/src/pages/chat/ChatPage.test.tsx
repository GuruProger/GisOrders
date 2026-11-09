import { QueryClient } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes, useNavigate } from 'react-router'
import { qk } from '@/api/queryKeys'
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
  // A rollback must not clear the conversation that was already loaded.
  expect(screen.getByText('Добрый день')).toBeInTheDocument()
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

function spyInvalidate() {
  return vi.spyOn(QueryClient.prototype, 'invalidateQueries')
}

test('marks the chat read on open and invalidates unread, list and detail', async () => {
  const read = vi.fn(() => HttpResponse.json({ message: 'Отмечено' }))
  server.use(http.post('/api/v1/chats/1/read', read))
  const invalidate = spyInvalidate()

  renderPage()
  await screen.findByText('Иван')
  openSocket()

  await waitFor(() => expect(read).toHaveBeenCalledTimes(1))
  await waitFor(() => {
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.chats.unread() })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.chats.list() })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.chats.detail(1) })
  })
})

test('invalidates the conversation when the peer reads our messages', async () => {
  const read = vi.fn(() => HttpResponse.json({ message: 'Отмечено' }))
  server.use(http.post('/api/v1/chats/1/read', read))
  const invalidate = spyInvalidate()

  renderPage()
  await screen.findByText('Иван')
  const socket = openSocket()

  await waitFor(() => expect(read).toHaveBeenCalled())
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.chats.list() }))
  invalidate.mockClear()

  act(() => {
    socket.receive({ type: 'message.read', chat_id: 1, user_id: 3, count: 1 })
  })

  await waitFor(() => {
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.chats.detail(1) })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.chats.unread() })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.chats.list() })
  })
})

test('refetches messages missed while the socket was disconnected', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  const missed: Message = {
    id: 100,
    chat_id: 1,
    sender_id: 3,
    text: 'Пропущенное сообщение',
    is_read: false,
    created_at: localIso(0, 10),
  }
  let includeMissed = false
  server.use(
    http.get('/api/v1/chats/1', () =>
      HttpResponse.json(
        includeMissed ? { ...chat, messages: [...chat.messages, missed] } : chat,
      ),
    ),
  )
  const read = vi.fn(() => HttpResponse.json({ message: 'Отмечено' }))
  server.use(http.post('/api/v1/chats/1/read', read))
  const invalidate = spyInvalidate()

  renderPage()
  await screen.findByText('Иван')
  const first = openSocket()
  await waitFor(() => expect(read).toHaveBeenCalled())
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.chats.list() }))
  invalidate.mockClear()

  act(() => {
    first.serverClose(1006)
  })
  expect(await screen.findByText('Нет связи, переподключаемся')).toBeInTheDocument()

  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2), { timeout: 3000 })
  includeMissed = true
  const second = FakeWebSocket.last()
  act(() => {
    second.open()
    second.receive({ type: 'auth.ok', chat_id: 1, user_id: user.id })
  })

  expect(await screen.findByText('Пропущенное сообщение')).toBeInTheDocument()
  expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.chats.detail(1) })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.chats.unread() })
  expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.chats.list() })
})

test('queues one message while offline and flushes it after reconnect', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  const saved: Message = {
    id: 55,
    chat_id: 1,
    sender_id: user.id,
    text: 'Офлайн-сообщение',
    is_read: false,
    created_at: localIso(0, 10),
  }
  const send = vi.fn(() => HttpResponse.json(saved))
  server.use(http.post('/api/v1/chats/1/messages', send))

  renderPage()
  await screen.findByText('Иван')
  const first = openSocket()

  act(() => {
    first.serverClose(1006)
  })
  expect(await screen.findByText('Нет связи, переподключаемся')).toBeInTheDocument()

  await userEvent.type(screen.getByLabelText('Сообщение'), 'Офлайн-сообщение')
  await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))

  expect(screen.getByText('Офлайн-сообщение')).toBeInTheDocument()
  expect(bubble('Офлайн-сообщение')).toHaveAttribute('data-pending', 'true')
  expect(send).not.toHaveBeenCalled()

  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2), { timeout: 3000 })
  const second = FakeWebSocket.last()
  act(() => {
    second.open()
    second.receive({ type: 'auth.ok', chat_id: 1, user_id: user.id })
  })

  await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
  await waitFor(() =>
    expect(bubble('Офлайн-сообщение')).toHaveAttribute('data-pending', 'false'),
  )
  expect(screen.getAllByText('Офлайн-сообщение')).toHaveLength(1)
})

test('rollback removes only the failed optimistic message', async () => {
  const saved: Message = {
    id: 61,
    chat_id: 1,
    sender_id: user.id,
    text: 'Первое',
    is_read: false,
    created_at: localIso(0, 10),
  }
  const pendingResponses: Array<(response: Response) => void> = []
  server.use(
    http.post(
      '/api/v1/chats/1/messages',
      () =>
        new Promise<Response>((resolve) => {
          pendingResponses.push(resolve)
        }),
    ),
  )

  renderPage()
  await screen.findByText('Иван')
  openSocket()

  await userEvent.type(screen.getByLabelText('Сообщение'), 'Первое')
  await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))
  await userEvent.type(screen.getByLabelText('Сообщение'), 'Второе')
  await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))

  await waitFor(() => expect(pendingResponses).toHaveLength(2))

  await act(async () => {
    pendingResponses[0]?.(HttpResponse.json(saved))
  })
  await act(async () => {
    pendingResponses[1]?.(HttpResponse.json({ detail: 'Ошибка' }, { status: 500 }))
  })

  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось отправить')
  expect(screen.queryByText('Второе')).not.toBeInTheDocument()
  expect(screen.getByText('Первое')).toBeInTheDocument()
})

test('resets the draft and transient messages when switching chats', async () => {
  server.use(
    http.get('/api/v1/chats/2', () =>
      HttpResponse.json({ ...chat, id: 2, last_message: null, messages: [] }),
    ),
    http.post('/api/v1/chats/2/read', () => HttpResponse.json({ message: 'Отмечено' })),
  )

  function SwitchChat() {
    const navigate = useNavigate()
    return <button onClick={() => navigate('/chats/2')}>Второй чат</button>
  }

  render(
    <TestProviders initialEntries={['/chats/1']}>
      <SwitchChat />
      <Routes>
        <Route path="/chats/:id" element={<ChatPage />} />
      </Routes>
    </TestProviders>,
  )

  await screen.findByText('Иван')
  const socket = openSocket()
  act(() => {
    socket.receive({
      type: 'message.created',
      message: {
        id: 300,
        chat_id: 1,
        sender_id: 3,
        text: 'Из первого чата',
        is_read: false,
        created_at: localIso(0, 11),
      },
    })
  })
  expect(screen.getByText('Из первого чата')).toBeInTheDocument()

  await userEvent.type(screen.getByLabelText('Сообщение'), 'черновик')
  await userEvent.click(screen.getByRole('button', { name: 'Второй чат' }))

  await screen.findByText('Сообщений пока нет')
  expect(screen.getByLabelText('Сообщение')).toHaveValue('')
  expect(screen.queryByText('Из первого чата')).not.toBeInTheDocument()
})

test('disables sending for drafts longer than 2000 characters', async () => {
  renderPage()
  await screen.findByText('Иван')
  openSocket()

  const textarea = screen.getByLabelText('Сообщение')
  const button = screen.getByRole('button', { name: 'Отправить' })

  fireEvent.change(textarea, { target: { value: 'а'.repeat(2000) } })
  expect(button).toBeEnabled()

  fireEvent.change(textarea, { target: { value: 'а'.repeat(2001) } })
  expect(button).toBeDisabled()
})

test('closes the socket on unmount and does not open another', async () => {
  const { unmount } = renderPage()
  await screen.findByText('Иван')
  const socket = openSocket()

  unmount()

  expect(socket.readyState).toBe(3)
  await new Promise((resolve) => setTimeout(resolve, 30))
  expect(FakeWebSocket.instances).toHaveLength(1)
})

test('keeps the conversation and shows an inline notice when a refetch fails', async () => {
  const read = vi.fn(() => HttpResponse.json({ message: 'Отмечено' }))
  server.use(http.post('/api/v1/chats/1/read', read))
  let fail = false
  server.use(
    http.get('/api/v1/chats/1', () =>
      fail ? HttpResponse.json({ detail: 'Ошибка' }, { status: 500 }) : HttpResponse.json(chat),
    ),
  )
  const invalidate = spyInvalidate()

  renderPage()
  await screen.findByText('Иван')
  const socket = openSocket()
  await waitFor(() => expect(read).toHaveBeenCalled())
  await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.chats.list() }))

  fail = true
  act(() => {
    socket.receive({ type: 'message.read', chat_id: 1, user_id: 3, count: 1 })
  })

  expect(await screen.findByText(/Не удалось обновить чат/)).toBeInTheDocument()
  expect(screen.getByText('Добрый день')).toBeInTheDocument()
  expect(screen.queryByText('Не удалось загрузить чат')).not.toBeInTheDocument()
})
