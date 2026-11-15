import { Link } from 'react-router'
import { EmptyState } from '@/shared/ui/EmptyState'

const backLinkClasses =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-moss-600 px-4 text-base font-medium text-white transition-colors hover:bg-leaf-500 focus-visible:ring-2 focus-visible:ring-leaf-500 focus-visible:outline-none'

export function NotFoundPage() {
  return (
    <section className="mx-auto flex min-h-[60vh] w-full max-w-3xl items-center justify-center">
      <EmptyState
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
