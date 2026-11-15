import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Card } from '@/shared/ui/Card'

export interface AuthLayoutProps {
  title: string
  subtitle?: string
  children: ReactNode
  footer?: ReactNode
}

/** Shared branded frame for the login and registration screens. */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-surface px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 size-80 -translate-x-1/2 rounded-full bg-sage-100 blur-3xl"
      />

      <div className="relative flex w-full max-w-sm flex-col gap-6">
        <Link
          to="/"
          aria-label="GisOrders — на главную"
          className="flex items-center justify-center gap-2.5 focus-visible:rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-moss-600 text-lg font-bold text-white">
            G
          </span>
          <span className="text-xl font-semibold tracking-tight text-forest-900">GisOrders</span>
        </Link>

        <Card className="rounded-2xl p-6 shadow-[0_1px_2px_rgba(16,36,26,0.04)]">
          <h1 className="text-2xl font-semibold text-forest-900">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted-strong">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </Card>

        {footer ? <div className="text-center text-sm text-muted-strong">{footer}</div> : null}
      </div>
    </main>
  )
}
