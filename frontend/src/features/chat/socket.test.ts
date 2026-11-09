import {
  FakeWebSocket,
  installFakeWebSocket,
  uninstallFakeWebSocket,
} from '@/test/fakeSocket'
import { chatSocketUrl, createChatSocket, nextReconnectDelay, type ChatEvent } from './socket'

const refreshSession = vi.hoisted(() => vi.fn())

vi.mock('@/api/refresh', () => ({ refreshSession }))

const flushPromises = async (): Promise<void> => {
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  installFakeWebSocket()
  refreshSession.mockReset()
  refreshSession.mockResolvedValue({})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  uninstallFakeWebSocket()
})

test('reconnect delay grows exponentially and is capped with jitter', () => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5)

  expect(nextReconnectDelay(0)).toBe(1000)
  expect(nextReconnectDelay(1)).toBe(2000)
  expect(nextReconnectDelay(4)).toBe(16000)
  expect(nextReconnectDelay(5)).toBe(30000)
  expect(nextReconnectDelay(10)).toBe(30000)
})

test('reconnect delay jitter is within 20% of the base value', () => {
  const random = vi.spyOn(Math, 'random')

  random.mockReturnValue(0)
  expect(nextReconnectDelay(0)).toBe(800)
  expect(nextReconnectDelay(10)).toBe(24000)

  random.mockReturnValue(0.999999)
  expect(nextReconnectDelay(0)).toBeLessThanOrEqual(1200)

  random.mockRestore()
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const delay = nextReconnectDelay(0)
    expect(delay).toBeGreaterThanOrEqual(800)
    expect(delay).toBeLessThanOrEqual(1200)
    expect(nextReconnectDelay(10)).toBeLessThanOrEqual(36000)
  }
})

test('builds the socket url from the location with the api prefix', () => {
  vi.stubEnv('VITE_WS_URL', '')

  const url = chatSocketUrl(7)

  expect(url).toBe(`${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/v1/ws/chats/7`)
})

test('uses VITE_WS_URL when configured', () => {
  vi.stubEnv('VITE_WS_URL', 'ws://socket.example.com/api/v1/')

  expect(chatSocketUrl(3)).toBe('ws://socket.example.com/api/v1/ws/chats/3')
})

test('sends the auth frame on open and goes online after auth.ok', () => {
  const statuses: Array<'online' | 'offline'> = []
  const socket = createChatSocket({
    chatId: 1,
    getToken: () => 'access-token',
    onEvent: () => undefined,
    onStatus: (status) => statuses.push(status),
  })

  const ws = FakeWebSocket.last()
  ws.open()

  expect(ws.sentJson()).toEqual([{ type: 'auth', token: 'access-token' }])

  ws.receive({ type: 'auth.ok', chat_id: 1, user_id: 2 })

  expect(statuses).toEqual(['online'])
  socket.close()
})

test('delivers event frames and ignores malformed ones', () => {
  const events: ChatEvent[] = []
  const socket = createChatSocket({
    chatId: 1,
    getToken: () => 'token',
    onEvent: (event) => events.push(event),
    onStatus: () => undefined,
  })

  const ws = FakeWebSocket.last()
  ws.open()

  ws.onmessage?.({ data: 'not json' } as MessageEvent)
  ws.receive({ type: 'pong' })
  ws.receive({ type: 'message.created', message: {} })
  ws.receive({ type: 'message.created', message: null })
  ws.receive({
    type: 'message.created',
    message: {
      id: 5,
      chat_id: 1,
      sender_id: 2,
      text: 'Привет',
      is_read: false,
      created_at: 'not-a-date',
    },
  })
  ws.receive({
    type: 'message.created',
    message: {
      id: '5',
      chat_id: 1,
      sender_id: 2,
      text: 'Привет',
      is_read: false,
      created_at: '2026-11-09T10:00:00',
    },
  })
  ws.receive({
    type: 'message.created',
    message: {
      id: 5,
      chat_id: 1,
      sender_id: 2,
      text: 'Привет',
      is_read: false,
      created_at: '2026-11-09T10:00:00',
    },
  })
  ws.receive({ type: 'message.read', chat_id: 1, user_id: 2, count: 3 })
  ws.receive({ type: 'typing', chat_id: 1, user_id: 2, is_typing: true })

  expect(events).toEqual([
    {
      type: 'message.created',
      message: {
        id: 5,
        chat_id: 1,
        sender_id: 2,
        text: 'Привет',
        is_read: false,
        created_at: '2026-11-09T10:00:00',
      },
    },
    { type: 'message.read', chat_id: 1, user_id: 2, count: 3 },
    { type: 'typing', chat_id: 1, user_id: 2, is_typing: true },
  ])
  socket.close()
})

test('reconnects after an unexpected close with a fresh token', async () => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0.5)

  let token = 'first-token'
  const statuses: Array<'online' | 'offline'> = []
  const socket = createChatSocket({
    chatId: 1,
    getToken: () => token,
    onEvent: () => undefined,
    onStatus: (status) => statuses.push(status),
  })

  const first = FakeWebSocket.last()
  first.open()
  first.serverClose(1006)

  expect(statuses).toEqual(['offline'])
  expect(FakeWebSocket.instances).toHaveLength(1)

  token = 'second-token'
  await vi.advanceTimersByTimeAsync(1000)

  expect(FakeWebSocket.instances).toHaveLength(2)
  const second = FakeWebSocket.last()
  second.open()

  expect(second.sentJson()).toEqual([{ type: 'auth', token: 'second-token' }])
  socket.close()
})

test('stops reconnecting after 4403 and reports the access error', async () => {
  vi.useFakeTimers()
  const onError = vi.fn()
  const socket = createChatSocket({
    chatId: 1,
    getToken: () => 'token',
    onEvent: () => undefined,
    onStatus: () => undefined,
    onError,
  })

  const ws = FakeWebSocket.last()
  ws.open()
  ws.serverClose(4403)
  await vi.advanceTimersByTimeAsync(60000)

  expect(onError).toHaveBeenCalledWith('Нет доступа к чату')
  expect(FakeWebSocket.instances).toHaveLength(1)
  socket.close()
})

test('refreshes the session once on 4401 and reconnects', async () => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0.5)

  const socket = createChatSocket({
    chatId: 1,
    getToken: () => 'token',
    onEvent: () => undefined,
    onStatus: () => undefined,
  })

  const first = FakeWebSocket.last()
  first.open()
  first.serverClose(4401)
  await flushPromises()

  expect(refreshSession).toHaveBeenCalledTimes(1)

  await vi.advanceTimersByTimeAsync(1000)
  expect(FakeWebSocket.instances).toHaveLength(2)
  socket.close()
})

test('reconnectNow clears the backoff and connects immediately', async () => {
  vi.useFakeTimers()
  vi.spyOn(Math, 'random').mockReturnValue(0.5)

  const socket = createChatSocket({
    chatId: 1,
    getToken: () => 'token',
    onEvent: () => undefined,
    onStatus: () => undefined,
  })

  const first = FakeWebSocket.last()
  first.open()
  first.serverClose(1006)

  expect(FakeWebSocket.instances).toHaveLength(1)

  socket.reconnectNow()

  expect(FakeWebSocket.instances).toHaveLength(2)
  const second = FakeWebSocket.last()
  second.open()
  second.receive({ type: 'auth.ok', chat_id: 1, user_id: 2 })

  // The cancelled backoff timer must not open a third socket afterwards.
  await vi.advanceTimersByTimeAsync(60000)
  expect(FakeWebSocket.instances).toHaveLength(2)
  socket.close()
})

test('close prevents any further reconnect', async () => {
  vi.useFakeTimers()
  const socket = createChatSocket({
    chatId: 1,
    getToken: () => 'token',
    onEvent: () => undefined,
    onStatus: () => undefined,
  })

  const ws = FakeWebSocket.last()
  ws.open()
  socket.close()
  await vi.advanceTimersByTimeAsync(60000)

  expect(FakeWebSocket.instances).toHaveLength(1)
})

test('typing and read frames are ignored while offline', () => {
  const socket = createChatSocket({
    chatId: 1,
    getToken: () => 'token',
    onEvent: () => undefined,
    onStatus: () => undefined,
  })

  const ws = FakeWebSocket.last()
  socket.sendTyping(true)
  socket.sendRead()
  expect(ws.sent).toEqual([])

  ws.open()
  socket.sendTyping(true)
  socket.sendRead()
  expect(ws.sentJson()).toEqual([
    { type: 'auth', token: 'token' },
    { type: 'typing', is_typing: true },
    { type: 'read' },
  ])
  socket.close()
})

test('stops reconnecting after 4404 and reports the access error', async () => {
  vi.useFakeTimers()
  const onError = vi.fn()
  const socket = createChatSocket({
    chatId: 1,
    getToken: () => 'token',
    onEvent: () => undefined,
    onStatus: () => undefined,
    onError,
  })

  const ws = FakeWebSocket.last()
  ws.open()
  ws.serverClose(4404)
  await vi.advanceTimersByTimeAsync(60000)

  expect(onError).toHaveBeenCalledWith('Нет доступа к чату')
  expect(FakeWebSocket.instances).toHaveLength(1)
  socket.close()
})

test('stops and reports an auth error when the token refresh fails on 4401', async () => {
  vi.useFakeTimers()
  refreshSession.mockRejectedValue(new Error('network down'))
  const onError = vi.fn()
  const socket = createChatSocket({
    chatId: 1,
    getToken: () => 'token',
    onEvent: () => undefined,
    onStatus: () => undefined,
    onError,
  })

  const ws = FakeWebSocket.last()
  ws.open()
  ws.serverClose(4401)
  await flushPromises()
  await flushPromises()

  expect(onError).toHaveBeenCalledWith('Не удалось авторизоваться')

  await vi.advanceTimersByTimeAsync(60000)
  expect(FakeWebSocket.instances).toHaveLength(1)
  socket.close()
})
