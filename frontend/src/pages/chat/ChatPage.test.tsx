import { QueryClient } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Link, Route, Routes, useNavigate } from 'react-router'
import { qk } from '@/api/queryKeys'
import type { Chat, Message, User } from '@/api/types'
import { useSession } from '@/features/auth/session'
import {
  getPendingMessage,
  resetPendingMessages,
  setPendingMessage,
} from '@/features/chat/pending'
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

function serveSecondChat(): void {
  server.use(
    http.get('/api/v1/chats/2', () =>
      HttpResponse.json({ ...chat, id: 2, last_message: null, unread_count: 0, messages: [] }),
    ),
    http.post('/api/v1/chats/2/read', () => HttpResponse.json({ message: 'Отмечено' })),
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

/** Renders the chat plus a list route so leaving it unmounts `ChatPage`. */
function renderUnmountable() {
  return render(
    <TestProviders initialEntries={['/chats/1']}>
      <Routes>
        <Route path="/chats/:id" element={<ChatPage />} />
        <Route path="/chats" element={<Link to="/chats/1">Открыть чат</Link>} />
      </Routes>
    </TestProviders>,
  )
}

/** Renders the chat route with buttons that keep the same component instance. */
function renderSwitchable() {
  function SwitchChat() {
    const navigate = useNavigate()
    return (
      <div>
        <button onClick={() => navigate('/chats/1')}>Первый чат</button>
        <button onClick={() => navigate('/chats/2')}>Второй чат</button>
      </div>
    )
  }

  return render(
    <TestProviders initialEntries={['/chats/1']}>
      <SwitchChat />
      <Routes>
        <Route path="/chats/:id" element={<ChatPage />} />
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
  resetPendingMessages()
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

test('does not move a failed online message into another chat', async () => {
  serveSecondChat()
  const saved: Message = {
    id: 501,
    chat_id: 1,
    sender_id: user.id,
    text: 'Сообщение первого чата',
    is_read: false,
    created_at: localIso(0, 10),
  }
  let attempts = 0
  const retryResponses: Array<(response: Response) => void> = []
  server.use(
    http.post('/api/v1/chats/1/messages', () => {
      attempts += 1
      if (attempts === 1) return HttpResponse.error()
      return new Promise<Response>((resolve) => {
        retryResponses.push(resolve)
      })
    }),
  )
  const sendToSecond = vi.fn(() =>
    HttpResponse.json({ ...saved, id: 502, chat_id: 2, text: 'Сообщение второго чата' }),
  )
  server.use(http.post('/api/v1/chats/2/messages', sendToSecond))

  renderSwitchable()
  await screen.findByText('Иван')
  openSocket()

  await userEvent.type(screen.getByLabelText('Сообщение'), 'Сообщение первого чата')
  await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))

  await waitFor(() =>
    expect(bubble('Сообщение первого чата')).toHaveAttribute('data-pending', 'true'),
  )
  // The online send failed and the flush retry is still in flight.
  await waitFor(() => expect(attempts).toBe(2))

  await userEvent.click(screen.getByRole('button', { name: 'Второй чат' }))
  await screen.findByText('Сообщений пока нет')

  expect(sendToSecond).not.toHaveBeenCalled()
  expect(screen.queryByText('Сообщение первого чата')).not.toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()

  // The late response belongs to chat 1 and must not touch chat 2.
  await act(async () => {
    retryResponses[0]?.(HttpResponse.json(saved))
  })

  expect(screen.queryByText('Сообщение первого чата')).not.toBeInTheDocument()
  expect(screen.getByText('Сообщений пока нет')).toBeInTheDocument()
})

test('retains an offline queued message for its chat while visiting another', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  serveSecondChat()
  const saved: Message = {
    id: 510,
    chat_id: 1,
    sender_id: user.id,
    text: 'Офлайн первого чата',
    is_read: false,
    created_at: localIso(0, 10),
  }
  const send = vi.fn(() => HttpResponse.json(saved))
  server.use(http.post('/api/v1/chats/1/messages', send))

  renderSwitchable()
  await screen.findByText('Иван')
  const first = openSocket()
  act(() => {
    first.serverClose(1006)
  })
  expect(await screen.findByText('Нет связи, переподключаемся')).toBeInTheDocument()

  await userEvent.type(screen.getByLabelText('Сообщение'), 'Офлайн первого чата')
  await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))
  expect(bubble('Офлайн первого чата')).toHaveAttribute('data-pending', 'true')

  await userEvent.click(screen.getByRole('button', { name: 'Второй чат' }))
  await screen.findByText('Сообщений пока нет')
  expect(screen.queryByText('Офлайн первого чата')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Первый чат' }))
  expect(await screen.findByText('Офлайн первого чата')).toBeInTheDocument()
  expect(bubble('Офлайн первого чата')).toHaveAttribute('data-pending', 'true')
  expect(send).not.toHaveBeenCalled()

  // Reconnecting the reopened chat flushes the retained message for chat 1.
  const reopened = FakeWebSocket.last()
  act(() => {
    reopened.open()
    reopened.receive({ type: 'auth.ok', chat_id: 1, user_id: user.id })
  })

  await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
  await waitFor(() =>
    expect(bubble('Офлайн первого чата')).toHaveAttribute('data-pending', 'false'),
  )
})

test('reconnects immediately on the browser online event', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  const saved: Message = {
    id: 520,
    chat_id: 1,
    sender_id: user.id,
    text: 'Офлайн-событие',
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

  await userEvent.type(screen.getByLabelText('Сообщение'), 'Офлайн-событие')
  await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))
  expect(bubble('Офлайн-событие')).toHaveAttribute('data-pending', 'true')
  expect(send).not.toHaveBeenCalled()

  act(() => {
    window.dispatchEvent(new Event('online'))
  })

  // No waiting for the backoff timer: a new socket exists right away.
  expect(FakeWebSocket.instances).toHaveLength(2)
  const second = FakeWebSocket.last()
  act(() => {
    second.open()
    second.receive({ type: 'auth.ok', chat_id: 1, user_id: user.id })
  })

  await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
  expect(FakeWebSocket.instances).toHaveLength(2)
})

test('flushes once when the socket and the browser both report the connection', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  const saved: Message = {
    id: 530,
    chat_id: 1,
    sender_id: user.id,
    text: 'Один раз',
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

  await userEvent.type(screen.getByLabelText('Сообщение'), 'Один раз')
  await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))
  expect(bubble('Один раз')).toHaveAttribute('data-pending', 'true')

  act(() => {
    window.dispatchEvent(new Event('online'))
  })
  expect(FakeWebSocket.instances).toHaveLength(2)
  const second = FakeWebSocket.last()

  act(() => {
    second.open()
    second.receive({ type: 'auth.ok', chat_id: 1, user_id: user.id })
    window.dispatchEvent(new Event('online'))
  })

  await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
  await new Promise((resolve) => setTimeout(resolve, 30))
  expect(send).toHaveBeenCalledTimes(1)
})

test('rolls back a queued message when its online flush hits a network error', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5)
  const saved: Message = {
    id: 540,
    chat_id: 1,
    sender_id: user.id,
    text: 'Вторая попытка',
    is_read: false,
    created_at: localIso(0, 10),
  }
  let attempts = 0
  server.use(
    http.post('/api/v1/chats/1/messages', () => {
      attempts += 1
      if (attempts === 1) return HttpResponse.error()
      return HttpResponse.json(saved)
    }),
  )

  renderPage()
  await screen.findByText('Иван')
  const first = openSocket()
  act(() => {
    first.serverClose(1006)
  })
  expect(await screen.findByText('Нет связи, переподключаемся')).toBeInTheDocument()

  await userEvent.type(screen.getByLabelText('Сообщение'), 'Сбойная отправка')
  await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))
  expect(bubble('Сбойная отправка')).toHaveAttribute('data-pending', 'true')

  await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2), { timeout: 3000 })
  const second = FakeWebSocket.last()
  act(() => {
    second.open()
    second.receive({ type: 'auth.ok', chat_id: 1, user_id: user.id })
  })

  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось отправить')
  expect(screen.queryByText('Сбойная отправка')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()

  await userEvent.type(screen.getByLabelText('Сообщение'), 'Вторая попытка')
  const retry = screen.getByRole('button', { name: 'Отправить' })
  expect(retry).toBeEnabled()
  await userEvent.click(retry)

  expect(await screen.findByText('Вторая попытка')).toBeInTheDocument()
  expect(attempts).toBe(2)
})

test('clears the peer typing state when the message is submitted', async () => {
  const saved: Message = {
    id: 550,
    chat_id: 1,
    sender_id: user.id,
    text: 'С отправкой',
    is_read: false,
    created_at: localIso(0, 10),
  }
  server.use(http.post('/api/v1/chats/1/messages', () => HttpResponse.json(saved)))

  renderPage()
  await screen.findByText('Иван')
  const socket = openSocket()

  await userEvent.type(screen.getByLabelText('Сообщение'), 'С отправкой')
  await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))

  await waitFor(() =>
    expect(socket.sentJson()).toContainEqual({ type: 'typing', is_typing: false }),
  )
})

test('ignores the browser online event for an invalid chat id', async () => {
  const invalidate = spyInvalidate()

  render(
    <TestProviders initialEntries={['/chats/nope']}>
      <Routes>
        <Route path="/chats/:id" element={<ChatPage />} />
      </Routes>
    </TestProviders>,
  )

  expect(await screen.findByText('Чат не найден')).toBeInTheDocument()
  invalidate.mockClear()

  act(() => {
    window.dispatchEvent(new Event('online'))
  })

  expect(invalidate).not.toHaveBeenCalledWith({ queryKey: qk.chats.detail(Number.NaN) })
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

test('flushes a queued message once when the chat is unmounted and remounted mid-flight', async () => {
  const saved: Message = {
    id: 700,
    chat_id: 1,
    sender_id: user.id,
    text: 'Один раз после возврата',
    is_read: false,
    created_at: localIso(0, 12),
  }
  let posts = 0
  const responses: Array<(response: Response) => void> = []
  server.use(
    http.post('/api/v1/chats/1/messages', () => {
      posts += 1
      return new Promise<Response>((resolve) => {
        responses.push(resolve)
      })
    }),
  )
  let includeSaved = false
  server.use(
    http.get('/api/v1/chats/1', () =>
      HttpResponse.json(
        includeSaved ? { ...chat, messages: [...chat.messages, saved] } : chat,
      ),
    ),
  )

  renderUnmountable()
  await screen.findByText('Иван')
  const first = openSocket()
  act(() => {
    first.serverClose(1006)
  })
  expect(await screen.findByText('Нет связи, переподключаемся')).toBeInTheDocument()

  await userEvent.type(screen.getByLabelText('Сообщение'), 'Один раз после возврата')
  await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))
  expect(posts).toBe(0)

  act(() => {
    window.dispatchEvent(new Event('online'))
  })
  const second = FakeWebSocket.last()
  act(() => {
    second.open()
    second.receive({ type: 'auth.ok', chat_id: 1, user_id: user.id })
  })
  await waitFor(() => expect(posts).toBe(1))

  // Leave the chat while the queued message is still posting.
  await userEvent.click(screen.getByRole('link', { name: /К чатам/ }))
  expect(await screen.findByRole('link', { name: 'Открыть чат' })).toBeInTheDocument()

  // Coming back must show the queue entry but not start a second POST.
  await userEvent.click(screen.getByRole('link', { name: 'Открыть чат' }))
  expect(await screen.findByText('Один раз после возврата')).toBeInTheDocument()
  const reopened = FakeWebSocket.last()
  act(() => {
    reopened.open()
    reopened.receive({ type: 'auth.ok', chat_id: 1, user_id: user.id })
  })
  await new Promise((resolve) => setTimeout(resolve, 30))
  expect(posts).toBe(1)

  // The original POST resolves after unmount: one bubble, no duplicate.
  includeSaved = true
  await act(async () => {
    responses[0]?.(HttpResponse.json(saved))
  })

  await waitFor(() =>
    expect(bubble('Один раз после возврата')).toHaveAttribute('data-pending', 'false'),
  )
  expect(screen.getAllByText('Один раз после возврата')).toHaveLength(1)
})

test('keeps a queued message when a flush fails after unmount and retries on remount', async () => {
  const queued: Message = {
    id: -900,
    chat_id: 1,
    sender_id: user.id,
    text: 'Ждёт повтора',
    is_read: false,
    created_at: localIso(0, 12),
  }
  const saved: Message = { ...queued, id: 710 }
  setPendingMessage(1, queued)

  let posts = 0
  const responses: Array<(response: Response) => void> = []
  server.use(
    http.post('/api/v1/chats/1/messages', () => {
      posts += 1
      return new Promise<Response>((resolve) => {
        responses.push(resolve)
      })
    }),
  )

  renderUnmountable()
  await screen.findByText('Иван')
  expect(posts).toBe(0)

  openSocket()
  await waitFor(() => expect(posts).toBe(1))

  await userEvent.click(screen.getByRole('link', { name: /К чатам/ }))
  expect(await screen.findByRole('link', { name: 'Открыть чат' })).toBeInTheDocument()

  // The unmounted instance's POST fails: the entry stays queued, with no UI.
  await act(async () => {
    responses[0]?.(HttpResponse.error())
  })
  expect(getPendingMessage(1)).not.toBeNull()

  await userEvent.click(screen.getByRole('link', { name: 'Открыть чат' }))
  expect(await screen.findByText('Ждёт повтора')).toBeInTheDocument()
  expect(screen.queryByText('Не удалось отправить')).not.toBeInTheDocument()

  // Reconnecting the reopened chat retries the retained message.
  const reopened = FakeWebSocket.last()
  act(() => {
    reopened.open()
    reopened.receive({ type: 'auth.ok', chat_id: 1, user_id: user.id })
  })
  await waitFor(() => expect(posts).toBe(2))

  await act(async () => {
    responses[1]?.(HttpResponse.json(saved))
  })
  await waitFor(() => expect(getPendingMessage(1)).toBeNull())
  expect(screen.getAllByText('Ждёт повтора')).toHaveLength(1)
})

test('retries a queued message when its in-flight flush fails after a remount', async () => {
  const queued: Message = {
    id: -910,
    chat_id: 1,
    sender_id: user.id,
    text: 'Повтор после возврата',
    is_read: false,
    created_at: localIso(0, 12),
  }
  const saved: Message = { ...queued, id: 730 }
  setPendingMessage(1, queued)

  let posts = 0
  const responses: Array<(response: Response) => void> = []
  server.use(
    http.post('/api/v1/chats/1/messages', () => {
      posts += 1
      return new Promise<Response>((resolve) => {
        responses.push(resolve)
      })
    }),
  )

  renderUnmountable()
  await screen.findByText('Иван')
  openSocket()
  await waitFor(() => expect(posts).toBe(1))

  // Leave while the flush is in flight and come back before it settles: the
  // new instance cannot own the POST, so it must wait for the release.
  await userEvent.click(screen.getByRole('link', { name: /К чатам/ }))
  expect(await screen.findByRole('link', { name: 'Открыть чат' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('link', { name: 'Открыть чат' }))
  expect(await screen.findByText('Повтор после возврата')).toBeInTheDocument()
  expect(bubble('Повтор после возврата')).toHaveAttribute('data-pending', 'true')

  const reopened = FakeWebSocket.last()
  act(() => {
    reopened.open()
    reopened.receive({ type: 'auth.ok', chat_id: 1, user_id: user.id })
  })
  await new Promise((resolve) => setTimeout(resolve, 30))
  expect(posts).toBe(1)

  // The original POST rejects while its owner is unmounted: the retained entry
  // must be picked up by the mounted instance instead of stalling.
  await act(async () => {
    responses[0]?.(HttpResponse.error())
  })
  await waitFor(() => expect(posts).toBe(2))

  await act(async () => {
    responses[1]?.(HttpResponse.json(saved))
  })
  await waitFor(() => expect(getPendingMessage(1)).toBeNull())
  await waitFor(() =>
    expect(bubble('Повтор после возврата')).toHaveAttribute('data-pending', 'false'),
  )
  await userEvent.type(screen.getByLabelText('Сообщение'), 'Ещё')
  expect(screen.getByRole('button', { name: 'Отправить' })).toBeEnabled()
})

test('keeps an online message that failed after the user left', async () => {
  let posts = 0
  const responses: Array<(response: Response) => void> = []
  server.use(
    http.post('/api/v1/chats/1/messages', () => {
      posts += 1
      return new Promise<Response>((resolve) => {
        responses.push(resolve)
      })
    }),
  )

  renderUnmountable()
  await screen.findByText('Иван')
  openSocket()

  await userEvent.type(screen.getByLabelText('Сообщение'), 'Потерянное сообщение')
  await userEvent.click(screen.getByRole('button', { name: 'Отправить' }))
  await waitFor(() => expect(posts).toBe(1))

  // Leave while the ordinary POST is still in flight.
  await userEvent.click(screen.getByRole('link', { name: /К чатам/ }))
  expect(await screen.findByRole('link', { name: 'Открыть чат' })).toBeInTheDocument()

  // A permanent API failure lands after unmount: it must not vanish silently.
  await act(async () => {
    responses[0]?.(HttpResponse.json({ detail: 'Ошибка' }, { status: 500 }))
  })
  expect(getPendingMessage(1)).not.toBeNull()

  await userEvent.click(screen.getByRole('link', { name: 'Открыть чат' }))
  expect(await screen.findByText('Потерянное сообщение')).toBeInTheDocument()
  expect(bubble('Потерянное сообщение')).toHaveAttribute('data-pending', 'true')
})

test('does not flush a queued message before the socket confirms auth', async () => {
  const queued: Message = {
    id: -901,
    chat_id: 1,
    sender_id: user.id,
    text: 'До авторизации',
    is_read: false,
    created_at: localIso(0, 12),
  }
  setPendingMessage(1, queued)

  const saved: Message = { ...queued, id: 711 }
  const send = vi.fn(() => HttpResponse.json(saved))
  server.use(http.post('/api/v1/chats/1/messages', send))

  renderPage()
  expect(await screen.findByText('До авторизации')).toBeInTheDocument()

  const socket = FakeWebSocket.last()
  act(() => {
    socket.open()
  })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  expect(send).not.toHaveBeenCalled()

  act(() => {
    socket.receive({ type: 'auth.ok', chat_id: 1, user_id: user.id })
  })
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1))
})

test('invalidates the chat detail when a late flush succeeds after unmount', async () => {
  const queued: Message = {
    id: -902,
    chat_id: 1,
    sender_id: user.id,
    text: 'Поздний успех',
    is_read: false,
    created_at: localIso(0, 12),
  }
  setPendingMessage(1, queued)
  const saved: Message = { ...queued, id: 720 }

  const responses: Array<(response: Response) => void> = []
  server.use(
    http.post(
      '/api/v1/chats/1/messages',
      () =>
        new Promise<Response>((resolve) => {
          responses.push(resolve)
        }),
    ),
  )

  const invalidate = spyInvalidate()
  const { unmount } = renderPage()
  await screen.findByText('Иван')
  openSocket()
  await waitFor(() => expect(responses).toHaveLength(1))
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.chats.detail(1) }),
  )
  invalidate.mockClear()

  unmount()

  await act(async () => {
    responses[0]?.(HttpResponse.json(saved))
  })

  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({ queryKey: qk.chats.detail(1) }),
  )
  expect(getPendingMessage(1)).toBeNull()
})
