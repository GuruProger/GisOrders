import type { Message } from '@/api/types'

/**
 * One queued message per chat. Kept outside the component because `/chats/:id`
 * is reused while navigating and a chat may be closed before its message is
 * flushed; the queue must survive both cases without crossing chats.
 */
const pendingByChat = new Map<number, Message>()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

export function getPendingMessage(chatId: number): Message | null {
  return pendingByChat.get(chatId) ?? null
}

export function setPendingMessage(chatId: number, message: Message): void {
  if (pendingByChat.get(chatId)?.id === message.id) return
  pendingByChat.set(chatId, message)
  emit()
}

/** Clears the queue entry only when it still belongs to `messageId`. */
export function clearPendingMessage(chatId: number, messageId: number): void {
  const current = pendingByChat.get(chatId)
  if (current === undefined || current.id !== messageId) return
  pendingByChat.delete(chatId)
  emit()
}

export function subscribePending(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Test-only reset; production queues live for the whole session. */
export function resetPendingMessages(): void {
  if (pendingByChat.size === 0) return
  pendingByChat.clear()
  emit()
}
