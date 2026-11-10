function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Builds the post-login destination from the `state.from` value that
 * `RequireAuth` passes to `/login`. Preserves query string and hash; falls
 * back to `/` when the state is absent or malformed.
 */
export function returnPath(state: unknown, fallback = '/'): string {
  if (!isRecord(state)) return fallback
  const from = state.from
  if (!isRecord(from)) return fallback

  const pathname =
    typeof from.pathname === 'string' && from.pathname.startsWith('/')
      ? from.pathname
      : fallback
  const search = typeof from.search === 'string' && from.search.startsWith('?') ? from.search : ''
  const hash = typeof from.hash === 'string' && from.hash.startsWith('#') ? from.hash : ''

  return `${pathname}${search}${hash}`
}
