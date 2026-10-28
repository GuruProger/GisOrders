import { Link } from 'react-router'

export function NotFoundPage() {
  return (
    <section className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-semibold text-forest-900">Страница не найдена</h1>
      <p className="text-sm text-muted-strong">Такой страницы нет или она была перемещена.</p>
      <Link
        to="/"
        className="inline-flex min-h-11 items-center font-medium text-moss-600 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
      >
        Вернуться на ленту
      </Link>
    </section>
  )
}
