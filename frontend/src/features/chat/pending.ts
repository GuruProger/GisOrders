import type { Message } from '@/api/types'

/**
 * One queued message per chat. Kept outside the component because `/chats/:id`
 * is reused while navigating and a chat may be closed before its message is
 * flushed; the queue must survive both cases without crossing chats.
 */
const pendingByChat = new Map<number, Message>()
const listeners = new Set<() => void>()

/**
 * `${chatId}:${messageId}` of every message whose flush request is in flight.
 * Module-global so an unmount/remount cannot start a second POST for the same
 * queued message.
 */
const flushing = new Set<string>()

/**
 * Bumped whenever a flush reservation is taken or released. The reserved set
 * itself is invisible to React, so a mounted instance that failed to take the
 * reservation needs an observable signal to retry a message whose POST
 * settled while its owner was unmounted.
 */
let flushRevision = 0

function flushKey(chatId: number, messageId: number): string {
  return `${chatId}:${messageId}`
}

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

/**
 * Reserves the single in-flight POST for a queued message. Returns `false`
 * when another component instance is already flushing the same message.
 */
export function tryBeginFlush(chatId: number, messageId: number): boolean {
  const key = flushKey(chatId, messageId)
  if (flushing.has(key)) return false
  flushing.add(key)
  flushRevision += 1
  emit()
  return true
}

/** Releases the in-flight reservation after the POST settles. */
export function endFlush(chatId: number, messageId: number): void {
  if (!flushing.delete(flushKey(chatId, messageId))) return
  flushRevision += 1
  emit()
}

/** Current flush revision; a change means a reservation was taken or released. */
export function getFlushRevision(): number {
  return flushRevision
}

/**
 * Drops every queued message, e.g. when the session ends. Called from the
 * session store so a new user never inherits another account's drafts.
 */
export function clearPendingMessages(): void {
  if (pendingByChat.size === 0 && flushing.size === 0) return
  pendingByChat.clear()
  flushing.clear()
  emit()
}

/** Test-only reset; production resets go through the session store. */
export function resetPendingMessages(): void {
  clearPendingMessages()
}

export function subscribePending(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
