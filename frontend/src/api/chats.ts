import { apiRequest } from './client'
import type { Chat, Message } from './types'

/** Chat detail shape: the chat row plus its latest messages (oldest first). */
export type ChatDetail = Chat & { messages: Message[] }

/** Active chats of the current user, newest activity first. */
export async function fetchChats(): Promise<Chat[]> {
  const { data } = await apiRequest<Chat[]>('/chats/my')
  return data
}

/** One chat with its messages; the backend caps the list at 50 by default. */
export async function fetchChat(id: number): Promise<ChatDetail> {
  const { data } = await apiRequest<ChatDetail>(`/chats/${id}`)
  return data
}

/** Total unread messages across all chats, used by the navigation badge. */
export async function fetchUnreadCount(): Promise<number> {
  const { data } = await apiRequest<{ unread_count: number }>('/chats/unread/count')
  return data.unread_count
}

export async function sendMessage(chatId: number, text: string): Promise<Message> {
  const { data } = await apiRequest<Message>(`/chats/${chatId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  return data
}

export async function markChatRead(chatId: number): Promise<void> {
  await apiRequest<{ message: string }>(`/chats/${chatId}/read`, { method: 'POST' })
}
