import { request as newApiRequest, type APIRequestContext } from '@playwright/test'
import { CUSTOMER_EMAIL, EXECUTOR_EMAIL, PASSWORD } from './helpers'

/**
 * Accounts are provisioned through the public API so the suite no longer
 * depends on `backend/seed_db.py` (a local-only, uncommitted helper).
 *
 * `E2E_API_URL` points straight at the backend: global setup may run before
 * the Vite dev server is ready, and the backend is a hard prerequisite anyway.
 */
const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000'

interface Account {
  email: string
  username: string
}

function deriveUsername(email: string, fallback: string): string {
  const local = email.split('@')[0] ?? ''
  const cleaned = local.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 32)
  return cleaned.length > 0 ? cleaned : fallback
}

function accounts(): Account[] {
  return [
    {
      email: CUSTOMER_EMAIL,
      username:
        process.env.E2E_CUSTOMER_USERNAME ?? deriveUsername(CUSTOMER_EMAIL, 'e2e_customer'),
    },
    {
      email: EXECUTOR_EMAIL,
      username:
        process.env.E2E_EXECUTOR_USERNAME ?? deriveUsername(EXECUTOR_EMAIL, 'e2e_executor'),
    },
  ]
}

async function login(
  request: APIRequestContext,
  email: string,
): Promise<{ ok: boolean; status: number; body: string }> {
  const response = await request.post(`${API_URL}/api/v1/users/login/json`, {
    data: { email, password: PASSWORD },
  })
  return { ok: response.ok(), status: response.status(), body: await response.text() }
}

async function register(
  request: APIRequestContext,
  account: Account,
): Promise<{ ok: boolean; status: number; body: string }> {
  const response = await request.post(`${API_URL}/api/v1/users/register`, {
    data: {
      email: account.email,
      username: account.username,
      password: PASSWORD,
    },
  })
  return { ok: response.ok(), status: response.status(), body: await response.text() }
}

async function ensureAccount(request: APIRequestContext, account: Account): Promise<void> {
  const existing = await login(request, account.email)
  if (existing.ok) return

  const created = await register(request, account)
  if (!created.ok && created.status !== 409) {
    throw new Error(
      `Не удалось создать аккаунт ${account.email}: ` +
        `register ${created.status} ${created.body}`,
    )
  }

  const afterRegister = await login(request, account.email)
  if (!afterRegister.ok) {
    throw new Error(
      `Аккаунт ${account.email} существует, но вход не удался: ` +
        `login ${afterRegister.status} ${afterRegister.body}; ` +
        `register ${created.status} ${created.body}`,
    )
  }
}

export default async function globalSetup(): Promise<void> {
  const request = await newApiRequest.newContext({ baseURL: API_URL })
  try {
    for (const account of accounts()) {
      await ensureAccount(request, account)
    }
  } finally {
    await request.dispose()
  }
}
