import { Link } from 'react-router'
import { EmptyState } from '@/shared/ui/EmptyState'

const backLinkClasses =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-moss-600 px-4 text-base font-medium text-white transition-colors hover:bg-leaf-500 focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:outline-none'

/** Compass outline: signals a missing route instead of the generic empty-list stump. */
function CompassIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-9"
    >
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.2 8.8-1.7 4.7-4.7 1.7 1.7-4.7 4.7-1.7Z" />
    </svg>
  )
}

export function NotFoundPage() {
  return (
    <section className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center">
      <EmptyState
        icon={<CompassIcon />}
        title="Страница не найдена"
        description="Такой страницы нет или она была перемещена."
        action={
          <Link to="/" className={backLinkClasses}>
            На ленту
          </Link>
        }
      />
    </section>
  )
}
