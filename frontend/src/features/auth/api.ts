import { useMutation } from '@tanstack/react-query'
import { apiRequest } from '@/api/client'
import { ApiError } from '@/api/errors'
import type { TokenPair, User } from '@/api/types'
import { getRefreshToken } from '@/shared/lib/storage'
import { useSession } from './session'

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export interface Credentials {
  email: string
  password: string
}

export interface RegisterPayload {
  email: string
  username: string
  phone_number: string | null
  password: string
}

export async function login(email: string, password: string): Promise<TokenPair> {
  const { data } = await apiRequest<TokenPair>('/users/login/json', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, password }),
  })

  useSession.getState().setSession(data)
  return data
}

/** Creates the account and signs the new user in straight away. */
export async function register(payload: RegisterPayload): Promise<TokenPair> {
  await apiRequest<User>('/users/register', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  })

  return login(payload.email, payload.password)
}

export async function logout(): Promise<void> {
  const refreshToken = getRefreshToken()

  try {
    if (refreshToken) {
      await apiRequest<null>('/users/logout', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
    }
  } finally {
    // The local session is over even when the server call fails.
    useSession.getState().clear()
  }
}

export function useLogin() {
  return useMutation({
    mutationFn: (credentials: Credentials) => login(credentials.email, credentials.password),
  })
}

export function useRegister() {
  return useMutation({
    mutationFn: (payload: RegisterPayload) => register(payload),
  })
}

/** Human-readable message for a mutation failure, or `null` on success. */
export function mutationErrorMessage(error: unknown, fallback: string): string | null {
  if (!error) return null
  if (error instanceof ApiError) return error.message
  return fallback
}
