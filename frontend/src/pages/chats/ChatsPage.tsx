import { useQueries, useQuery } from '@tanstack/react-query'
import { format, isSameDay } from 'date-fns'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { fetchChats } from '@/api/chats'
import { qk } from '@/api/queryKeys'
import type { Chat } from '@/api/types'
import { fetchUser } from '@/api/users'
import { useSession } from '@/features/auth/session'
import { formatShortDate } from '@/shared/lib/format'
import { useDocumentTitle } from '@/shared/lib/use-document-title'
import { Avatar } from '@/shared/ui/Avatar'
import { Button } from '@/shared/ui/Button'
import { EmptyState } from '@/shared/ui/EmptyState'
import { Skeleton } from '@/shared/ui/Skeleton'
import { UnreadBadge } from '@/shared/ui/UnreadBadge'

const NAME_STALE_MS = 5 * 60_000

/** The other participant of a chat; `null` when the current user is unknown. */
export function opponentId(chat: Chat, meId: number | null): number {
  return chat.customer_id === meId ? chat.executor_id : chat.customer_id
}

/** HH:mm for today, otherwise a short date like `1 окт`. */
function formatChatTime(iso: string): string {
  const date = new Date(iso)
  return isSameDay(date, new Date()) ? format(date, 'HH:mm') : formatShortDate(iso)
}

/** «Чаты»: active conversations with the opponent's name and last message. */
export function ChatsPage() {
  useDocumentTitle('Чаты — GisOrders')
  const user = useSession((state) => state.user)
  const meId = user?.id ?? null

  const query = useQuery({ queryKey: qk.chats.list(), queryFn: fetchChats })

  const chats = useMemo(
    () =>
      [...(query.data ?? [])].sort(
        (left, right) => new Date(right.updated_at).getTime() - new Date(left.updated_at).getTime(),
      ),
    [query.data],
  )

  const opponentIds = useMemo(() => {
    const ids = chats.map((chat) => opponentId(chat, meId))
    return [...new Set(ids)]
  }, [chats, meId])

  const nameQueries = useQueries({
    queries: opponentIds.map((id) => ({
      queryKey: qk.users.detail(id),
      queryFn: () => fetchUser(id),
      staleTime: NAME_STALE_MS,
    })),
  })

  const names = new Map<number, string>()
  opponentIds.forEach((id, index) => {
    const username = nameQueries[index]?.data?.username
    if (username) names.set(id, username)
  })

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-6">
      <h1 className="text-2xl font-semibold text-forest-900">Чаты</h1>

      {query.isLoading && (
        <>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </>
      )}

      {query.isError && (
        <EmptyState
          title="Не удалось загрузить чаты"
          description="Проверьте соединение и попробуйте ещё раз."
          action={<Button onClick={() => void query.refetch()}>Повторить</Button>}
        />
      )}

      {!query.isLoading && !query.isError && chats.length === 0 && (
        <EmptyState
          title="Пока нет переписок"
          description="Чат появится, когда заказчик выберет исполнителя."
        />
      )}

      {chats.length > 0 && (
        <ul className="flex flex-col gap-2">
          {chats.map((chat) => {
            const otherId = opponentId(chat, meId)
            const name = names.get(otherId) ?? `Пользователь #${otherId}`

            return (
              <li key={chat.id}>
                <Link
                  to={`/chats/${chat.id}`}
                  className="flex min-h-16 items-center gap-3 rounded-xl border border-line bg-card p-3 transition-colors hover:border-moss-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
                >
                  <Avatar name={name} className="size-10" />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate font-semibold text-forest-900">{name}</p>
                      <span className="ml-auto shrink-0 text-xs text-muted">
                        {formatChatTime(chat.updated_at)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm text-muted-strong">
                        {chat.last_message ?? 'Нет сообщений'}
                      </p>
                      <UnreadBadge count={chat.unread_count} className="ml-auto shrink-0" />
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
