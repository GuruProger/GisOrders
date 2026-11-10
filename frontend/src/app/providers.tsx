import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { bootstrap } from '@/features/auth/session'
import { attachSessionCacheReset } from '@/features/auth/session-cache'

interface ToastEntry {
  id: number
  message: string
}

interface ToastContextValue {
  show: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}

const TOAST_TTL_MS = 4_000

/**
 * Minimal toast host built on an `aria-live` region. Later tasks can push
 * messages without changing the provider tree.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([])
  const nextId = useRef(0)

  const show = useCallback((message: string) => {
    nextId.current += 1
    const id = nextId.current
    setToasts((current) => [...current, { id, message }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, TOAST_TTL_MS)
  }, [])

  const value = useMemo(() => ({ show }), [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-0 p-4">
        {toasts.map((toast) => (
          <p key={toast.id} className="rounded-[10px] bg-forest-800 px-4 py-2 text-white">
            {toast.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000 },
      mutations: { retry: false },
    },
  })
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient)

  useEffect(() => {
    const detachSessionCacheReset = attachSessionCacheReset(queryClient)
    void bootstrap()
    return detachSessionCacheReset
  }, [queryClient])

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}
