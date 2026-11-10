import { API_BASE_URL } from '@/shared/config/env'

/**
 * Joins the configured API base with a path and, when running in a browser,
 * resolves it to an absolute URL (MSW and some runtimes reject relative ones).
 */
export function apiUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/+$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  const url = `${base}${suffix}`
  if (typeof window === 'undefined') return url
  return new URL(url, window.location.origin).toString()
}
