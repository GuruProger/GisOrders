import { refreshSession } from '@/api/refresh'
import type { Message } from '@/api/types'

export type ChatEvent =
  | { type: 'message.created'; message: Message }
  | { type: 'message.read'; chat_id: number; user_id: number; count: number }
  | { type: 'typing'; chat_id: number; user_id: number; is_typing: boolean }

export interface ChatSocketOptions {
  chatId: number
  getToken(): string | null
  onEvent(event: ChatEvent): void
  onStatus(status: 'online' | 'offline'): void
  onError?(message: string): void
}

export interface ChatSocket {
  close(): void
  sendTyping(isTyping: boolean): void
  sendRead(): void
}

const MAX_RECONNECT_DELAY = 30_000
const JITTER_RATIO = 0.2

const OPEN = 1

/** Exponential backoff with ±20% jitter; the cap applies before jitter. */
export function nextReconnectDelay(attempt: number): number {
  const base = Math.min(1000 * 2 ** Math.max(0, attempt), MAX_RECONNECT_DELAY)
  const jitter = base * JITTER_RATIO * (Math.random() * 2 - 1)
  return Math.round(base + jitter)
}

/**
 * `VITE_WS_URL` wins when set (it is the socket base including `/api/v1`);
 * otherwise derive `ws(s)://host/api/v1` from the current page.
 */
export function chatSocketUrl(chatId: number): string {
  const configured = (import.meta.env.VITE_WS_URL as string | undefined)?.trim()
  const base =
    configured && configured !== ''
      ? configured
      : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/api/v1`

  return `${base.replace(/\/+$/, '')}/ws/chats/${chatId}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toChatEvent(frame: Record<string, unknown>): ChatEvent | null {
  if (frame.type === 'message.created' && isRecord(frame.message)) {
    return { type: 'message.created', message: frame.message as unknown as Message }
  }

  if (
    frame.type === 'message.read' &&
    typeof frame.chat_id === 'number' &&
    typeof frame.user_id === 'number' &&
    typeof frame.count === 'number'
  ) {
    return {
      type: 'message.read',
      chat_id: frame.chat_id,
      user_id: frame.user_id,
      count: frame.count,
    }
  }

  if (
    frame.type === 'typing' &&
    typeof frame.chat_id === 'number' &&
    typeof frame.user_id === 'number' &&
    typeof frame.is_typing === 'boolean'
  ) {
    return {
      type: 'typing',
      chat_id: frame.chat_id,
      user_id: frame.user_id,
      is_typing: frame.is_typing,
    }
  }

  return null
}

/**
 * Keeps one authenticated socket per chat: it authorises with the first frame,
 * reconnects with jittered backoff, refreshes the token once on 4401 and stops
 * permanently on 4403/4404. `auth.ok`, `pong` and error frames stay internal.
 */
export function createChatSocket(options: ChatSocketOptions): ChatSocket {
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0
  let closed = false
  let stopped = false
  let refreshedOnce = false

  function clearTimer(): void {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  function scheduleReconnect(nextAttempt: number): void {
    if (closed || stopped) return
    clearTimer()
    const delay = nextReconnectDelay(nextAttempt)
    attempt = nextAttempt + 1
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, delay)
  }

  function handleFrame(frame: Record<string, unknown>): void {
    if (frame.type === 'auth.ok') {
      attempt = 0
      refreshedOnce = false
      options.onStatus('online')
      return
    }

    const event = toChatEvent(frame)
    if (event) options.onEvent(event)
  }

  function connect(): void {
    if (closed || stopped) return

    const current = new WebSocket(chatSocketUrl(options.chatId))
    socket = current

    current.onopen = () => {
      current.send(
        JSON.stringify({ type: 'auth', token: options.getToken() ?? '' }),
      )
    }

    current.onmessage = (event) => {
      let frame: unknown
      try {
        frame = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (isRecord(frame)) handleFrame(frame)
    }

    current.onclose = (event: CloseEvent) => {
      if (socket !== current) return
      socket = null
      options.onStatus('offline')
      if (closed || stopped) return

      if (event.code === 4403 || event.code === 4404) {
        stopped = true
        clearTimer()
        options.onError?.('Нет доступа к чату')
        return
      }

      if (event.code === 4401 && !refreshedOnce) {
        refreshedOnce = true
        clearTimer()
        void refreshSession()
          .then(() => scheduleReconnect(0))
          .catch(() => {
            stopped = true
            options.onError?.('Не удалось авторизоваться')
          })
        return
      }

      scheduleReconnect(attempt)
    }
  }

  function send(payload: Record<string, unknown>): void {
    if (closed || stopped || socket === null || socket.readyState !== OPEN) return
    socket.send(JSON.stringify(payload))
  }

  connect()

  return {
    close() {
      closed = true
      stopped = true
      clearTimer()
      const current = socket
      socket = null
      current?.close()
    },
    sendTyping(isTyping: boolean) {
      send({ type: 'typing', is_typing: isTyping })
    },
    sendRead() {
      send({ type: 'read' })
    },
  }
}
