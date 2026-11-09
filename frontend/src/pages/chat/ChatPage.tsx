import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react'
import { Link, useParams } from 'react-router'
import { fetchChat, markChatRead, sendMessage } from '@/api/chats'
import { ApiError } from '@/api/errors'
import { qk } from '@/api/queryKeys'
import { getAccessToken } from '@/api/token'
import type { Message } from '@/api/types'
import { fetchUser } from '@/api/users'
import { useSession } from '@/features/auth/session'
import { formatDayLabel, groupMessagesByDay } from '@/features/chat/group'
import {
  clearPendingMessage,
  endFlush,
  getPendingMessage,
  setPendingMessage,
  subscribePending,
  tryBeginFlush,
} from '@/features/chat/pending'
import { createChatSocket, type ChatSocket } from '@/features/chat/socket'
import { cn } from '@/shared/lib/cn'
import { useDocumentTitle } from '@/shared/lib/use-document-title'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Skeleton } from '@/shared/ui/Skeleton'
import { Textarea } from '@/shared/ui/Textarea'

const NAME_STALE_MS = 5 * 60_000
const TYPING_TIMEOUT_MS = 3000
const MAX_TEXT_LENGTH = 2000
const NEAR_BOTTOM_PX = 80

/** Negative ids keep optimistic messages apart from server ids. */
let tempMessageId = 0

function nextTempMessageId(): number {
  tempMessageId -= 1
  return tempMessageId
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

/**
 * A failure that is not an HTTP response (offline, DNS, timeout). Such a
 * message is kept in the per-chat queue instead of being rolled back.
 */
function isConnectionFailure(error: unknown): boolean {
  return !(error instanceof ApiError)
}

/** «Чат»: day-grouped timeline, optimistic sending and realtime updates. */
export function ChatPage() {
  const { id: rawId } = useParams()
  const id = Number(rawId)
  const validId = Number.isInteger(id) && id > 0

  const queryClient = useQueryClient()
  const user = useSession((state) => state.user)
  const myId = user?.id ?? null

  const [draft, setDraft] = useState('')
  const [extraMessages, setExtraMessages] = useState<Message[]>([])
  // The queue lives outside the component: it is keyed by chat id and has to
  // survive `/chats/1 → /chats/2` and a temporary unmount.
  const pending = useSyncExternalStore(
    subscribePending,
    () => getPendingMessage(id),
    () => null,
  )
  const [sendError, setSendError] = useState<string | null>(null)
  // `status` stays optimistically online to avoid a banner flash, while
  // `connected` only becomes true on the socket's first `auth.ok`; the queue
  // flush waits for that confirmed signal.
  const [status, setStatus] = useState<'online' | 'offline'>('online')
  const [connected, setConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [typing, setTyping] = useState(false)
  const [onlineSignal, setOnlineSignal] = useState(0)

  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const nearBottom = useRef(true)
  const socketRef = useRef<ChatSocket | null>(null)
  const previousStatus = useRef<'online' | 'offline'>(status)
  const mountedRef = useRef(true)
  const currentChatId = useRef(id)
  currentChatId.current = id

  const query = useQuery({
    queryKey: qk.chats.detail(id),
    queryFn: () => fetchChat(id),
    enabled: validId,
  })

  const chat = query.data
  const opponentId =
    chat === undefined ? null : chat.customer_id === myId ? chat.executor_id : chat.customer_id

  const nameQuery = useQuery({
    queryKey: qk.users.detail(opponentId ?? 0),
    queryFn: () => fetchUser(opponentId as number),
    enabled: opponentId !== null,
    staleTime: NAME_STALE_MS,
  })

  const name =
    nameQuery.data?.username ?? (opponentId === null ? null : `Пользователь #${opponentId}`)

  useDocumentTitle(name ? `${name} — GisOrders` : 'Чат — GisOrders')

  const messages = useMemo(() => {
    const seen = new Set<number>()
    const merged: Message[] = []
    const queued = pending === null ? [] : [pending]
    for (const message of [...(query.data?.messages ?? []), ...extraMessages, ...queued]) {
      if (seen.has(message.id)) continue
      seen.add(message.id)
      merged.push(message)
    }
    return merged
  }, [query.data?.messages, extraMessages, pending])

  const groups = useMemo(() => groupMessagesByDay(messages), [messages])

  const markRead = useCallback(async () => {
    try {
      await markChatRead(id)
    } catch {
      return
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.chats.detail(id) }),
      queryClient.invalidateQueries({ queryKey: qk.chats.unread() }),
      queryClient.invalidateQueries({ queryKey: qk.chats.list() }),
    ])
  }, [id, queryClient])

  const showTyping = useCallback(() => {
    setTyping(true)
    if (typingTimer.current !== null) clearTimeout(typingTimer.current)
    typingTimer.current = setTimeout(() => {
      typingTimer.current = null
      setTyping(false)
    }, TYPING_TIMEOUT_MS)
  }, [])

  const hideTyping = useCallback(() => {
    if (typingTimer.current !== null) {
      clearTimeout(typingTimer.current)
      typingTimer.current = null
    }
    setTyping(false)
  }, [])

  // Async continuations (POST/flush) must never touch state after unmount.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // `/chats/1` → `/chats/2` reuses this component, so every piece of transient
  // state has to be dropped when the conversation id changes.
  useEffect(() => {
    setDraft('')
    setExtraMessages([])
    setSendError(null)
    setConnectionError(null)
    setConnected(false)
    setTyping(false)
    if (typingTimer.current !== null) {
      clearTimeout(typingTimer.current)
      typingTimer.current = null
    }
  }, [id])

  // Mark everything read whenever the chat opens.
  useEffect(() => {
    if (!validId) return
    void markRead()
  }, [validId, markRead])

  useEffect(
    () => () => {
      if (typingTimer.current !== null) clearTimeout(typingTimer.current)
    },
    [],
  )

  useEffect(() => {
    if (!validId) return

    // Every callback of this socket belongs to this mount: after cleanup it
    // must not update state (React 19 ignores unmounted updates silently).
    let active = true

    const socket = createChatSocket({
      chatId: id,
      getToken: getAccessToken,
      onStatus: (next) => {
        if (!active) return
        setStatus(next)
        setConnected(next === 'online')
      },
      onError: (message) => {
        if (!active) return
        setConnectionError(message)
      },
      onEvent: (event) => {
        if (!active) return
        if (event.type === 'message.created') {
          const incoming = event.message
          setExtraMessages((current) =>
            current.some((message) => message.id === incoming.id)
              ? current
              : [...current, incoming],
          )

          const viewer = useSession.getState().user
          if (viewer === null || incoming.sender_id !== viewer.id) {
            if (document.visibilityState !== 'hidden') void markRead()
            void queryClient.invalidateQueries({ queryKey: qk.chats.unread() })
            void queryClient.invalidateQueries({ queryKey: qk.chats.list() })
          }
          return
        }

        if (event.type === 'typing') {
          const viewer = useSession.getState().user
          if (viewer !== null && event.user_id === viewer.id) return
          if (event.is_typing) showTyping()
          else hideTyping()
          return
        }

        // The other participant read our messages.
        const viewer = useSession.getState().user
        if (viewer !== null && event.user_id === viewer.id) return
        void queryClient.invalidateQueries({ queryKey: qk.chats.detail(id) })
        void queryClient.invalidateQueries({ queryKey: qk.chats.unread() })
        void queryClient.invalidateQueries({ queryKey: qk.chats.list() })
      },
    })

    socketRef.current = socket
    return () => {
      active = false
      socket.close()
      socketRef.current = null
    }
  }, [id, validId, markRead, queryClient, showTyping, hideTyping])

  // A reconnect can miss messages: refetch the conversation and the counters
  // as soon as the socket transitions offline → online.
  useEffect(() => {
    const previous = previousStatus.current
    previousStatus.current = status
    if (status !== 'online' || previous !== 'offline') return

    void Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.chats.detail(id) }),
      queryClient.invalidateQueries({ queryKey: qk.chats.unread() }),
      queryClient.invalidateQueries({ queryKey: qk.chats.list() }),
    ])
  }, [status, id, queryClient])

  // The browser `online` event is a second signal that the missed messages and
  // the queued one have to be retried even when the socket is still closed.
  useEffect(() => {
    function handleOnline(): void {
      if (!validId) return
      setOnlineSignal((current) => current + 1)
      // Do not wait for the socket's backoff timer when the browser already
      // knows the network is back.
      socketRef.current?.reconnectNow()
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: qk.chats.detail(id) }),
        queryClient.invalidateQueries({ queryKey: qk.chats.unread() }),
        queryClient.invalidateQueries({ queryKey: qk.chats.list() }),
      ])
    }

    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [id, validId, queryClient])

  // Flush the queued message of the current chat once the socket has confirmed
  // the connection. Ownership lives in `pending.ts`, so a remount cannot start
  // a second POST for the same message. The request uses the message's own chat
  // id so a late navigation can never send it to another conversation.
  useEffect(() => {
    if (!connected || pending === null) return
    const queued = pending
    const chatId = queued.chat_id
    if (!tryBeginFlush(chatId, queued.id)) return

    void (async () => {
      try {
        const saved = await sendMessage(chatId, queued.text)
        // The message really left: drop the queue entry even when this
        // instance is gone, otherwise a remount would POST it again.
        clearPendingMessage(chatId, queued.id)
        void queryClient.invalidateQueries({ queryKey: qk.chats.detail(chatId) })
        void queryClient.invalidateQueries({ queryKey: qk.chats.list() })
        void queryClient.invalidateQueries({ queryKey: qk.chats.unread() })
        if (!mountedRef.current || currentChatId.current !== chatId) return
        setExtraMessages((current) => [
          ...current.filter((message) => message.id !== queued.id),
          saved,
        ])
      } catch {
        // A failure after unmount must leave the message queued: the instance
        // that owned the POST can no longer show an error or a rollback.
        if (!mountedRef.current || currentChatId.current !== chatId) return
        // While the chat is open a failed flush must never wedge the
        // composer: roll it back and let the user send again. While another
        // chat is open the message stays queued for its own conversation.
        clearPendingMessage(chatId, queued.id)
        setExtraMessages((current) => current.filter((message) => message.id !== queued.id))
        setSendError('Не удалось отправить')
      } finally {
        endFlush(chatId, queued.id)
      }
    })()
  }, [connected, pending, onlineSignal, queryClient])

  // Keep the view pinned to the newest message only for readers already there.
  useEffect(() => {
    const element = listRef.current
    if (element && nearBottom.current) element.scrollTop = element.scrollHeight
  }, [messages.length])

  function handleScroll(): void {
    const element = listRef.current
    if (!element) return
    nearBottom.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM_PX
  }

  const canSend =
    pending === null && draft.trim().length > 0 && draft.length <= MAX_TEXT_LENGTH

  async function submit(): Promise<void> {
    if (!canSend) return

    const chatId = id
    const text = draft
    const temporary: Message = {
      id: nextTempMessageId(),
      chat_id: chatId,
      sender_id: myId ?? 0,
      text,
      is_read: false,
      created_at: new Date().toISOString(),
    }

    setDraft('')
    setSendError(null)
    // Sending clears the peer's «печатает…» immediately.
    socketRef.current?.sendTyping(false)

    // Offline: keep the single message until the socket comes back instead of
    // losing it (spec 7.6). The queue is keyed by the chat it was written in.
    if (status === 'offline') {
      setPendingMessage(chatId, temporary)
      return
    }

    setExtraMessages((current) => [...current, temporary])

    try {
      const saved = await sendMessage(chatId, text)
      // A late success must refresh the conversation even when its component
      // is already gone, so returning to it shows the sent message.
      void queryClient.invalidateQueries({ queryKey: qk.chats.detail(chatId) })
      void queryClient.invalidateQueries({ queryKey: qk.chats.list() })
      void queryClient.invalidateQueries({ queryKey: qk.chats.unread() })
      if (!mountedRef.current || currentChatId.current !== chatId) return
      setExtraMessages((current) => [
        ...current.filter((message) => message.id !== temporary.id),
        saved,
      ])
    } catch (error) {
      if (!mountedRef.current || currentChatId.current !== chatId) {
        // The user already left: keep a failed message queued for its own
        // chat, never for the one that happens to be rendered now.
        if (isConnectionFailure(error)) setPendingMessage(chatId, temporary)
        return
      }
      setExtraMessages((current) => current.filter((message) => message.id !== temporary.id))
      if (isConnectionFailure(error)) {
        // The HTTP call failed because the network went away: queue it.
        setPendingMessage(chatId, temporary)
        return
      }
      setSendError('Не удалось отправить')
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submit()
    }
  }

  if (!validId || isNotFound(query.error)) {
    return (
      <EmptyState
        title="Чат не найден"
        description="Возможно, ссылка устарела или переписка закрыта."
        action={
          <Link
            to="/chats"
            className="inline-flex min-h-11 items-center text-sm font-medium text-moss-600 hover:underline focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:outline-none"
          >
            К чатам
          </Link>
        }
      />
    )
  }

  if (chat === undefined) {
    if (query.isLoading) {
      return (
        <section className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-12 w-full" />
        </section>
      )
    }

    return (
      <EmptyState
        title="Не удалось загрузить чат"
        description="Проверьте соединение и попробуйте ещё раз."
        action={<Button onClick={() => void query.refetch()}>Повторить</Button>}
      />
    )
  }

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-3 pb-6">
      <header className="flex flex-col gap-2 border-b border-line pb-3">
        <Link
          to="/chats"
          className="inline-flex min-h-11 items-center text-sm font-medium text-moss-600 hover:underline focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:outline-none"
        >
          ← К чатам
        </Link>

        <div className="flex items-center gap-3">
          <Avatar name={name} className="size-10" />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-forest-900">{name}</h1>
            <Link
              to={`/orders/${chat.order_id}`}
              className="inline-flex min-h-11 items-center text-sm text-moss-600 hover:underline focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:outline-none"
            >
              К заказу
            </Link>
          </div>
        </div>
      </header>

      {connectionError ? (
        <p
          role="alert"
          className="rounded-xl bg-terracotta-50 px-3 py-2 text-sm text-terracotta-600"
        >
          {connectionError}
        </p>
      ) : status === 'offline' ? (
        <p
          role="status"
          className="rounded-xl bg-sage-100 px-3 py-2 text-sm text-muted-strong"
        >
          Нет связи, переподключаемся
        </p>
      ) : null}

      {query.isError ? (
        <p
          role="alert"
          className="rounded-xl bg-terracotta-50 px-3 py-2 text-sm text-terracotta-600"
        >
          Не удалось обновить чат. Показаны сохранённые сообщения.
        </p>
      ) : null}

      <div
        ref={listRef}
        onScroll={handleScroll}
        data-testid="chat-messages"
        className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto rounded-xl border border-line bg-surface p-3"
      >
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-strong">Сообщений пока нет</p>
        ) : (
          groups.map((group, index) => (
            <div key={`${group.day}-${index}`} className="flex flex-col gap-2">
              <div className="flex justify-center">
                <span className="rounded-full bg-sage-100 px-3 py-1 text-xs font-medium text-muted-strong">
                  {formatDayLabel(group.day)}
                </span>
              </div>

              <ul className="flex flex-col gap-2">
                {group.messages.map((message) => {
                  const own = message.sender_id === myId
                  const awaiting = pending?.id === message.id

                  return (
                    <li
                      key={message.id}
                      className={cn('flex', own ? 'justify-end' : 'justify-start')}
                    >
                      <div
                        data-own={own ? 'true' : 'false'}
                        data-pending={awaiting ? 'true' : 'false'}
                        className={cn(
                          'max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line',
                          own
                            ? 'bg-moss-600 text-white'
                            : 'border border-line bg-card text-forest-900',
                          awaiting && 'opacity-70',
                        )}
                      >
                        <p>{message.text}</p>
                        <p
                          className={cn(
                            'mt-1 text-[11px]',
                            own ? 'text-sage-100' : 'text-muted',
                          )}
                        >
                          {format(new Date(message.created_at), 'HH:mm')}
                          {awaiting ? ' · Отправляется…' : null}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))
        )}
      </div>

      {typing ? (
        <p aria-live="polite" className="text-sm text-muted-strong">
          печатает…
        </p>
      ) : null}

      {sendError ? (
        <p role="alert" className="text-sm text-terracotta-600">
          {sendError}
        </p>
      ) : null}

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Textarea
          aria-label="Сообщение"
          rows={1}
          value={draft}
          placeholder="Напишите сообщение…"
          className="min-h-11 resize-none"
          onChange={(event) => {
            const value = event.target.value
            setDraft(value)
            setSendError(null)
            socketRef.current?.sendTyping(value.trim().length > 0)
          }}
          onKeyDown={handleKeyDown}
        />
        <Button
          type="submit"
          aria-label="Отправить"
          className="size-11 shrink-0"
          disabled={!canSend}
        >
          <span aria-hidden="true">→</span>
        </Button>
      </form>
    </section>
  )
}
