import { apiRequest } from '@/api/client'
import type { User } from '@/api/types'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/**
 * PATCH payload. Email and any other `User` fields are intentionally absent:
 * the backend treats `null` username/email as a conflict, and email is
 * read-only in the UI (ruling P39).
 */
export interface ProfileUpdateInput {
  username?: string
  phone_number?: string | null
}

export interface PasswordChangeInput {
  current_password: string
  new_password: string
}

/**
 * Converts typed phone numbers to the backend's `+7XXXXXXXXXX` shape. Empty
 * input means "clear the number", everything else must yield ten national
 * digits, otherwise the function returns `null` so the form can reject it
 * locally with the same format hint.
 */
export function normalizePhone(raw: string): string | null {
  const value = raw.trim()
  if (!value) return null

  const digits = value.replace(/\D/g, '')
  if (digits.length === 10) return `+7${digits}`

  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return `+7${digits.slice(1)}`
  }

  return null
}

/** `GET /users/me`; used to recover a session restored without profile data. */
export async function fetchMe(): Promise<User> {
  const { data } = await apiRequest<User>('/users/me')
  return data
}

/** `PATCH /users/me` — updates the name and phone of the current user. */
export async function updateProfile(input: ProfileUpdateInput): Promise<User> {
  const { data } = await apiRequest<User>('/users/me', {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  })
  return data
}

/** `POST /users/me/password`; the backend revokes every refresh token. */
export async function changePassword(input: PasswordChangeInput): Promise<void> {
  await apiRequest<null>('/users/me/password', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  })
}

/** `DELETE /users/me` — hard delete with the backend's cascade. */
export async function deleteAccount(): Promise<void> {
  await apiRequest<null>('/users/me', { method: 'DELETE' })
}
