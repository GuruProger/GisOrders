import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { ToastProvider } from '@/app/providers'

export interface TestProvidersProps {
  children: ReactNode
  initialEntries?: string[]
}

/**
 * Standard wrapper for component tests: a fresh QueryClient that never
 * retries, an in-memory router and the app toast host.
 */
export function TestProviders({ children, initialEntries }: TestProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries ?? ['/']}>
        <ToastProvider>{children}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}
