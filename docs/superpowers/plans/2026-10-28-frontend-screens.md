# GisOrders: экраны, карта, отклики и чаты — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Собрать все экраны приложения поверх готового каркаса: лента с поиском и фильтрами, карта, страница заказа, отклики обеих сторон, создание заказа с фото, чаты в реальном времени и профиль.

**Architecture:** Те же слои, что в фундаменте: `pages → widgets → features → entities → api/shared`. Серверное состояние — TanStack Query с ключами из `src/api/queryKeys.ts`, состояние фильтров — в URL, состояние сессии и роли — в Zustand/localStorage. Каждый экран собирается из виджетов и фич, не содержит прямых вызовов `fetch`.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind 4, TanStack Query 5, React Router 7, react-hook-form + zod, Leaflet + react-leaflet + leaflet.markercluster, date-fns, Vitest + Testing Library + MSW, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-frontend-design.md`

**Предыдущий план:** `docs/superpowers/plans/2026-10-28-frontend-foundation.md` — должен быть выполнен полностью.

## Global Constraints

- Интерфейс и тексты — на русском; код и коммиты — на английском.
- TypeScript strict; `any` в экспортируемых сигнатурах запрещён.
- Цвета только из токенов Tailwind (`bg-moss-600`, `text-forest-900`, `border-line` и т.д.).
- Зона нажатия ≥ 44×44 px; фокус всегда видим.
- Суммы — `2 500 ₽` (неразрывные пробелы), даты — `ru-RU` в местном времени.
- Все запросы идут через `apiRequest` из `src/api/client.ts`; прямых `fetch` в компонентах нет.
- Ключи TanStack Query — только из `src/api/queryKeys.ts`.
- Каждый список имеет состояния: загрузка (скелетон), пусто, ошибка с повтором.
- Коммит после каждой задачи.

## Review Focus

- **Заказ без фото или с битой ссылкой на медиа.** Ожидание: карточка и галерея не ломаются, показывается заглушка.
- **Дедлайн в UTC и часовой пояс пользователя.** Ожидание: «сегодня»/«завтра» считаются по местному времени, просроченный заказ помечается, а не показывается как актуальный.
- **Два пользователя одновременно принимают/отзывают отклик.** Ожидание: конфликт `order_not_open` показывается понятным текстом, список обновляется.
- **Обрыв WebSocket в середине переписки.** Ожидание: переподключение с растущей паузой, пропущенные сообщения подгружаются, отправленное не теряется.
- **Двойная отправка формы (двойной клик, медленная сеть).** Ожидание: кнопка блокируется на время запроса, дубль не создаётся.
- **Файл больше 5 МБ или не изображение.** Ожидание: понятная ошибка до отправки, остальные фото не страдают.

---

## Задача 1: Форматирование, расстояние и карточка заказа

**Files:**
- Create: `frontend/src/shared/lib/format.ts`, `plural.ts`, `frontend/src/shared/lib/format.test.ts`
- Create: `frontend/src/entities/order/lib/distance.ts`, `distance.test.ts`
- Create: `frontend/src/widgets/order-card/OrderCard.tsx`, `OrderCard.test.tsx`
- Create: `frontend/src/shared/ui/Card.tsx`, `Skeleton.tsx`, `EmptyState.tsx`
- Test: `frontend/src/widgets/order-card/OrderCard.test.tsx`

**Interfaces:**
- Consumes: `Order` из `src/api/types.ts`, `Badge` из `src/shared/ui/Badge.tsx`.
- Produces:
  - `formatMoney(value: number): string` → `2 500 ₽`
  - `formatDeadline(iso: string, now?: Date): string` → `сегодня, 18:00`, `завтра, 09:00`, `12 ноя`
  - `formatShortDate(iso: string): string` → `28 окт`
  - `plural(n: number, forms: [string, string, string]): string`
  - `type Point = { lat: number; lon: number }`
  - `distanceKm(a: Point, b: Point): number`
  - `formatDistance(km: number): string` → `850 м`, `1,2 км`, `12 км`
  - `<OrderCard order: Order; userPoint: Point; onClick?: () => void; selected?: boolean>` — элемент списка, `role="listitem"`.

- [ ] **Step 1: Написать падающие тесты**

`format.test.ts`:

```ts
import { formatDeadline, formatMoney } from './format'
import { plural } from './plural'

test('formats money with non-breaking spaces', () => {
  expect(formatMoney(2500)).toBe('2\u00A0500\u00A0₽')
  expect(formatMoney(0)).toBe('0\u00A0₽')
})

test('plural picks the right russian form', () => {
  const forms: [string, string, string] = ['отклик', 'отклика', 'откликов']
  expect(plural(1, forms)).toBe('отклик')
  expect(plural(3, forms)).toBe('отклика')
  expect(plural(5, forms)).toBe('откликов')
  expect(plural(11, forms)).toBe('откликов')
  expect(plural(21, forms)).toBe('отклик')
})

test('deadline today is rendered with local time', () => {
  const now = new Date('2026-10-28T09:00:00+03:00')
  expect(formatDeadline('2026-10-28T15:00:00Z', now)).toBe('сегодня, 18:00')
})
```

`distance.test.ts`:

```ts
import { distanceKm, formatDistance } from './distance'

test('distance between two nearby points', () => {
  const km = distanceKm({ lat: 55.7558, lon: 37.6173 }, { lat: 55.7658, lon: 37.6173 })
  expect(km).toBeCloseTo(1.11, 1)
})

test('formats meters and kilometers', () => {
  expect(formatDistance(0.85)).toBe('850 м')
  expect(formatDistance(1.24)).toBe('1,2 км')
  expect(formatDistance(12.4)).toBe('12 км')
})
```

`OrderCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { OrderCard } from './OrderCard'

const baseOrder = {
  id: 1, title: 'Спилить сухое дерево', description: 'Дерево во дворе',
  min_price: 2000, max_price: 3000, deadline: '2026-12-01T10:00:00Z',
  address: 'Москва', tree_type: 'сосна', tree_height: 12, tree_diameter: 35,
  photos: null, status: 'open' as const, created_at: '2026-10-01T10:00:00Z',
  closed_at: null, customer_id: 2, accepted_proposal_id: null,
  lat: 55.7658, lon: 37.6173, proposals_count: 3,
}

test('shows distance, price and proposals count', () => {
  render(<OrderCard order={baseOrder} userPoint={{ lat: 55.7558, lon: 37.6173 }} />)
  expect(screen.getByText('Спилить сухое дерево')).toBeInTheDocument()
  expect(screen.getByText('1,1 км')).toBeInTheDocument()
  expect(screen.getByText('3 отклика')).toBeInTheDocument()
  expect(screen.getByText(/3\u00A0000\u00A0₽/)).toBeInTheDocument()
})

test('zero proposals are shown as new order', () => {
  render(<OrderCard order={{ ...baseOrder, proposals_count: 0 }} userPoint={{ lat: 55.7558, lon: 37.6173 }} />)
  expect(screen.getByText('новый')).toBeInTheDocument()
})

test('missing photos do not break the card', () => {
  render(<OrderCard order={{ ...baseOrder, photos: ['/media/missing.jpg'] }} userPoint={{ lat: 55.7558, lon: 37.6173 }} />)
  expect(screen.getByRole('listitem')).toBeInTheDocument()
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd frontend && npm test`
Expected: FAIL — модулей нет.

- [ ] **Step 3: Реализовать форматирование**

`format.ts`: `Intl.NumberFormat('ru-RU')` + замена пробелов на `\u00A0`; `formatDeadline` сравнивает календарные дни в локальной зоне через `date-fns` (`isToday`, `isTomorrow`, `format(..., 'd MMM', { locale: ru })`).

`plural.ts`: правило русского языка по `n % 100` (11–14 → третья форма).

- [ ] **Step 4: Реализовать расстояние**

`distance.ts`: формула гаверсинуса, радиус Земли 6371 км; `formatDistance` — до 1 км в метрах с шагом 10, до 10 км с одним знаком, дальше целое.

- [ ] **Step 5: Реализовать карточку и базовые поверхности**

`Card.tsx` — белая карточка `rounded-xl border border-line bg-card`.
`Skeleton.tsx` — прямоугольник с `animate-pulse bg-sage-100`, принимает `className`.
`EmptyState.tsx` — иконка-заглушка, заголовок, описание, слот для кнопки.

`OrderCard.tsx`: заголовок (2 строки максимум, `line-clamp-2`), метаданные `расстояние · срок · порода, высота`, нижняя строка — `Badge` статуса и цена; при `proposals_count === 0` — бейдж «новый», иначе текст через `plural`. Фото-миниатюра 44×44 при наличии, при ошибке загрузки `onError` скрывает изображение и оставляет зелёный плейсхолдер.

- [ ] **Step 6: Убедиться, что тесты проходят**

Run: `cd frontend && npm test`
Expected: PASS, 8 тестов.

- [ ] **Step 7: Коммит**

```bash
git add frontend/src/shared/lib frontend/src/entities/order frontend/src/widgets/order-card frontend/src/shared/ui
git commit -m "feat(frontend): add order card and formatting helpers"
```

---

## Задача 2: Лента заказов

**Files:**
- Create: `frontend/src/api/queryKeys.ts`, `frontend/src/api/orders.ts`
- Create: `frontend/src/features/user-point/model.ts`
- Create: `frontend/src/features/filters/model.ts`, `model.test.ts`
- Create: `frontend/src/pages/feed/FeedPage.tsx`
- Modify: `frontend/src/app/router.tsx` — `/` рендерит `FeedPage`
- Test: `frontend/src/pages/feed/FeedPage.test.tsx`

**Interfaces:**
- Consumes: `apiRequest`, `OrderCard`, `Skeleton`, `EmptyState`.
- Produces:
  - `interface FeedFilters { q: string; radiusKm: number; minPrice?: number | null; maxPrice?: number | null; treeType?: string | null; maxHeight?: number | null; sortBy: 'created_at' | 'deadline' | 'min_price'; sortOrder: 'asc' | 'desc'; lat: number; lon: number }`
  - `parseFilters(search: string, fallback: Point): FeedFilters`
  - `toSearchParams(filters: FeedFilters): URLSearchParams`
  - `DEFAULT_FILTERS: Omit<FeedFilters, 'lat' | 'lon'>`
  - `qk.orders.available(filters: FeedFilters): readonly unknown[]`
  - `fetchAvailableOrders(filters: FeedFilters, page: number): Promise<{ orders: Order[]; total: number | null }>`
  - `useUserPoint(): [Point | null, (point: Point) => void]` — точка хранится в `localStorage` (`gisorders.point`), при отсутствии запрашивается `navigator.geolocation`.
  - `<FeedPage>` — маршрут `/`.

- [ ] **Step 1: Написать падающие тесты**

`frontend/src/features/filters/model.test.ts`:

```ts
import { DEFAULT_FILTERS, parseFilters, toSearchParams } from './model'

const point = { lat: 55.75, lon: 37.61 }

test('defaults when url is empty', () => {
  expect(parseFilters('', point)).toEqual({ ...DEFAULT_FILTERS, lat: 55.75, lon: 37.61 })
})

test('round-trips all filters', () => {
  const filters = {
    q: 'спил', radiusKm: 25, minPrice: 1000, maxPrice: 5000,
    treeType: 'сосна', maxHeight: 20, sortBy: 'min_price' as const, sortOrder: 'asc' as const,
    lat: 55.75, lon: 37.61,
  }
  expect(parseFilters(`?${toSearchParams(filters)}`, point)).toEqual(filters)
})

test('invalid values fall back to defaults', () => {
  const parsed = parseFilters('?radius=999&sort=unknown&min=x', point)
  expect(parsed.radiusKm).toBe(10)
  expect(parsed.sortBy).toBe('created_at')
  expect(parsed.minPrice).toBeNull()
})

test('blank search is dropped', () => {
  expect(toSearchParams({ ...DEFAULT_FILTERS, q: '   ', lat: 1, lon: 2 }).has('q')).toBe(false)
})
```

`FeedPage.test.tsx`:

```tsx
import { http, HttpResponse } from 'msw'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { server } from '@/test/msw'
import { TestProviders } from '@/test/providers'
import { FeedPage } from './FeedPage'

const order = { id: 1, title: 'Спилить сухое дерево', /* остальные поля как в задаче 1 */ }

test('renders first page of orders', async () => {
  server.use(http.get('/api/v1/orders/available', () => HttpResponse.json([order], { headers: { 'X-Total-Count': '1' } })))
  render(<FeedPage />, { wrapper: TestProviders })
  expect(await screen.findByText('Спилить сухое дерево')).toBeInTheDocument()
})

test('empty feed suggests widening the radius', async () => {
  server.use(http.get('/api/v1/orders/available', () => HttpResponse.json([], { headers: { 'X-Total-Count': '0' } })))
  render(<FeedPage />, { wrapper: TestProviders })
  expect(await screen.findByText(/заказов нет/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Увеличить радиус' })).toBeInTheDocument()
})

test('loads next page on demand', async () => {
  let calls = 0
  server.use(http.get('/api/v1/orders/available', ({ request }) => {
    calls += 1
    const page = new URL(request.url).searchParams.get('page')
    return HttpResponse.json([{ ...order, id: Number(page) }], { headers: { 'X-Total-Count': '3' } })
  }))
  render(<FeedPage />, { wrapper: TestProviders })
  await screen.findByText('Спилить сухое дерево')
  await userEvent.click(screen.getByRole('button', { name: 'Показать ещё' }))
  await vi.waitFor(() => expect(calls).toBe(2))
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd frontend && npm test`
Expected: FAIL — `FeedPage` не найден.

- [ ] **Step 3: Реализовать модель фильтров, запросы и ключи**

`filters/model.ts`: разбор `URLSearchParams` с валидацией (радиус 1–50, цены ≥ 0 и `min <= max`, сортировка из допустимых значений); `toSearchParams` опускает пустые и дефолтные значения, чтобы ссылка оставалась короткой; `DEFAULT_FILTERS = { q: '', radiusKm: 10, minPrice: null, maxPrice: null, treeType: null, maxHeight: null, sortBy: 'created_at', sortOrder: 'desc' }`.

`queryKeys.ts` — фабрика ключей для заказов, откликов, чатов, профиля (используется всеми следующими задачами).

`orders.ts`:

```ts
export async function fetchAvailableOrders(filters: FeedFilters, page: number): Promise<{ orders: Order[]; total: number | null }>
export async function fetchMyOrders(status?: OrderStatus): Promise<Order[]>
export async function fetchOrder(id: number): Promise<Order>
```

`fetchAvailableOrders` собирает query через `toSearchParams(filters)` плюс `page`/`per_page=20` и читает `total` из `X-Total-Count`.

- [ ] **Step 4: Реализовать точку пользователя**

`useUserPoint`: при первом обращении читает `storage.getPoint()`; если точки нет — `navigator.geolocation.getCurrentPosition` с таймаутом 8 секунд; при отказе возвращает `null` (экран ленты покажет выбор точки, реализуется в задаче 3).

- [ ] **Step 5: Реализовать экран**

`FeedPage`: `useInfiniteQuery` с `getNextPageParam` по `total`; заголовок «Заказы рядом» и счётчик `total`; список `OrderCard`; `IntersectionObserver` на sentinel с запасной кнопкой «Показать ещё» (кнопка остаётся в DOM для доступности и тестов); скелетоны при первой загрузке; `EmptyState` по макету. На телефоне жест «потянуть вниз» вызывает `refetch` (свои touch-обработчики, без библиотеки).

- [ ] **Step 6: Убедиться, что тесты проходят**

Run: `cd frontend && npm test && npm run typecheck`
Expected: PASS, 3 теста.

- [ ] **Step 7: Проверить вживую**

Run: бэкенд `uv run uvicorn main:app --reload`, фронтенд `npm run dev`.
Expected: лента показывает заказы из базы, прокрутка догружает следующую страницу, пустая база показывает подсказку.

- [ ] **Step 8: Коммит**

```bash
git add frontend/src
git commit -m "feat(frontend): add orders feed with infinite scroll"
```

---

## Задача 3: Фильтры, поиск и состояние в URL

**Files:**
- Create: `frontend/src/features/filters/FiltersSheet.tsx`, `SearchBar.tsx`, `ActiveFilters.tsx`, `FiltersSheet.test.tsx`
- Create: `frontend/src/shared/config/trees.ts`
- Modify: `frontend/src/pages/feed/FeedPage.tsx` — подключить панель и поиск
- Modify: `frontend/src/app/router.tsx` — маршрут `/map` (заглушка до задачи 4)

**Interfaces:**
- Consumes: `FeedFilters`, `parseFilters`, `toSearchParams`, `DEFAULT_FILTERS` из задачи 2; `Point`, `storage`.
- Produces:
  - `TREE_TYPES: readonly string[]` — 21 порода из спеки (9.3).
  - `<FiltersSheet open: boolean; value: FeedFilters; total: number | null; onApply(next: FeedFilters): void; onClose(): void>`

- [ ] **Step 1: Написать падающие тесты**

`FiltersSheet.test.tsx`:

```tsx
test('shows result count on apply button and returns new radius', async () => {
  const onApply = vi.fn()
  render(<FiltersSheet open value={{ ...DEFAULT_FILTERS, lat: 1, lon: 2 }} total={12} onApply={onApply} onClose={vi.fn()} />, { wrapper: TestProviders })

  await userEvent.click(screen.getByRole('radio', { name: '25 км' }))
  await userEvent.click(screen.getByRole('button', { name: 'Показать 12' }))

  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ radiusKm: 25 }))
})

test('reset returns defaults but keeps the point', async () => {
  const onApply = vi.fn()
  render(<FiltersSheet open value={{ ...DEFAULT_FILTERS, radiusKm: 50, lat: 1, lon: 2 }} total={3} onApply={onApply} onClose={vi.fn()} />, { wrapper: TestProviders })

  await userEvent.click(screen.getByRole('button', { name: 'Сбросить' }))

  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ radiusKm: 10, lat: 1, lon: 2 }))
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd frontend && npm test`
Expected: FAIL — модулей нет.

- [ ] **Step 3: Реализовать панель и поиск**

`SearchBar.tsx`: поле с иконкой, debounce 350 мс, `aria-label="Поиск заказов"`, скрывается при `!import.meta.env.VITE_FEATURE_SEARCH` (флаг из спеки 9.1; в `.env.example` указать `VITE_FEATURE_SEARCH=true`).

`FiltersSheet.tsx`: на телефоне — лист снизу (`<dialog>` с `showModal`), на десктопе — поповер под кнопкой; поля: «Где искать» (кнопка «Моё местоположение» и «Указать на карте» — вторая пока ведёт на `/map`), радиус (чипы 1/5/10/25/50), цена от/до, порода (чипы из `TREE_TYPES` + «Любая»), высота (любая/10/20), сортировка. Кнопка «Показать N» с `total`, при `total === null` — «Показать».

`ActiveFilters.tsx`: чипы активных фильтров с крестиком, снимают конкретный фильтр.

- [ ] **Step 4: Подключить к ленте**

`FeedPage` читает фильтры из `useSearchParams`, при изменении пишет обратно через `setSearchParams(..., { replace: true })`, сбрасывает страницу пагинации. Если точки нет — вместо списка `EmptyState` «Укажите, где искать» с кнопками «Разрешить геолокацию» и «Выбрать на карте».

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `cd frontend && npm test && npm run typecheck`
Expected: PASS, 2 теста панели плюс тесты модели из задачи 2.

- [ ] **Step 6: Проверить вживую**

Run: `npm run dev`.
Expected: поиск «спил» сужает выдачу, фильтр по породе и радиусу применяется, ссылка с фильтрами открывается в новой вкладке с теми же настройками.

- [ ] **Step 7: Коммит**

```bash
git add frontend/src frontend/.env.example
git commit -m "feat(frontend): add feed filters, search and url state"
```

---

## Задача 4: Карта

**Files:**
- Modify: `frontend/package.json` — добавить `leaflet`, `react-leaflet`, `leaflet.markercluster`, `@types/leaflet`, `@types/leaflet.markercluster`
- Create: `frontend/src/widgets/map/markers.ts`, `markers.test.ts`
- Create: `frontend/src/widgets/map/MapView.tsx`, `MapView.test.tsx`
- Create: `frontend/src/pages/map/MapPage.tsx`
- Modify: `frontend/src/app/router.tsx` — `/map` рендерит `MapPage`
- Modify: `frontend/src/app/styles.css` — импорт стилей Leaflet и кластера

**Interfaces:**
- Consumes: `Order`, `Point`, `parseFilters`, `fetchAvailableOrders`.
- Produces:
  - `interface MapMarker { id: number; lat: number; lon: number; price: number | null; label: string }`
  - `buildMarkers(orders: Order[]): MapMarker[]`
  - `<MapView markers: MapMarker[]; center: Point; selectedId?: number | null; onSelect?(id: number): void; className?: string>`

- [ ] **Step 1: Написать падающие тесты**

`markers.test.ts`:

```ts
import { buildMarkers } from './markers'

test('builds one marker per order with price label', () => {
  const markers = buildMarkers([{ id: 7, lat: 55.7, lon: 37.6, min_price: 2500, max_price: 4000 } as never])
  expect(markers).toEqual([{ id: 7, lat: 55.7, lon: 37.6, price: 2500, label: '2\u00A0500\u00A0₽' }])
})

test('order without price gets null price and dash label', () => {
  const markers = buildMarkers([{ id: 8, lat: 55.7, lon: 37.6, min_price: null, max_price: null } as never])
  expect(markers[0]).toMatchObject({ price: null, label: '—' })
})
```

`MapView.test.tsx`: смонтировать с `vi.mock('react-leaflet', ...)`, проверить, что для каждого маркера вызван рендер маркера и что клик по маркеру зовёт `onSelect` с его `id`.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd frontend && npm test`
Expected: FAIL — модулей нет.

- [ ] **Step 3: Реализовать маркеры и карту**

`markers.ts`: чистый маппинг, цена — `min_price`; подпись через `formatMoney`.

`MapView.tsx`: `MapContainer` с тайлами `https://tile.openstreetmap.org/{z}/{x}/{y}.png` и атрибуцией OSM; `MarkerClusterGroup`; кастомная иконка-«пилюля» с ценой (divIcon, классы Tailwind внутри строки); выбранный маркер — с обводкой `moss-600`; `useEffect` центрирует карту на `selectedId`.

- [ ] **Step 4: Реализовать экран карты**

`MapPage`: те же фильтры из URL, что у ленты; полноэкранная карта; кнопка «Назад к списку» (`navigate(-1)` с запасным `/`); нижний лист с карточками найденного (горизонтальная прокрутка) — выбор карточки центрирует маркер. При отсутствии точки — выбор точки кликом по карте и кнопка «Искать здесь», сохраняющая точку в `storage`.

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `cd frontend && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Проверить вживую**

Run: `npm run dev`.
Expected: маркеры видны, кластеризуются, клик открывает карточку, карта работает на телефоне жестами.

- [ ] **Step 7: Коммит**

```bash
git add frontend
git commit -m "feat(frontend): add map view with clustered order markers"
```

---

## Задача 5: Страница заказа

**Files:**
- Create: `frontend/src/pages/order/OrderPage.tsx`, `PhotoGallery.tsx`
- Create: `frontend/src/shared/lib/use-document-title.ts`
- Modify: `frontend/src/api/orders.ts` — `fetchOrder` уже есть, добавить `closeOrder(id)`, `deleteOrder(id)`
- Modify: `frontend/src/app/router.tsx` — `/orders/:id`
- Test: `frontend/src/pages/order/OrderPage.test.tsx`

**Interfaces:**
- Consumes: `fetchOrder`, `qk.orders.detail`, `Badge`, `formatMoney`, `formatDeadline`, `MapView`, `useRoleMode`, `useSession`.
- Produces:
  - `<OrderPage>` — маршрут `/orders/:id`
  - `closeOrder(id: number): Promise<void>` → `POST /orders/{id}/close`
  - `deleteOrder(id: number): Promise<void>` → `DELETE /orders/{id}`

- [ ] **Step 1: Написать падающие тесты**

`OrderPage.test.tsx` — четыре сценария через MSW:

```tsx
test('own open order shows edit and close actions')
test('other user open order shows respond action')
test('assigned order hides respond and shows the executor is chosen')
test('closed order shows closed badge and dates')
```

Проверки: для своего заказа есть кнопки «Редактировать» и «Закрыть заказ»; для чужого — кнопка «Откликнуться»; для `assigned` — текст «Исполнитель выбран» и нет кнопки отклика; для `closed` — бейдж «Закрыт». Секция откликов появится в задаче 7.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd frontend && npm test`
Expected: FAIL — `OrderPage` нет.

- [ ] **Step 3: Реализовать экран**

`OrderPage`: `useQuery(qk.orders.detail(id))`; скелетон; при 404 — `EmptyState` «Заказ не найден»; галерея фото (горизонтальный свайп, `onError` прячет битое изображение); описание, адрес, срок (`formatDeadline`), порода/высота/диаметр, вилка цены, статус; мини-карта с точкой; кнопки по состоянию и роли:

- свой заказ, `open` — «Редактировать», «Закрыть заказ», секция откликов (задача 7);
- чужой заказ, `open`, отклика ещё нет — «Откликнуться» (задача 6);
- чужой заказ, `open`, отклик есть — статус своего отклика;
- `assigned` — «Исполнитель выбран», у принявшего — «Перейти в чат»;
- `closed` — бейдж и даты, действия скрыты.

Закрытие — подтверждение в `<dialog>` с текстом «Заказ будет закрыт. Продолжить?»; после успеха инвалидация `qk.orders.detail(id)` и `qk.orders.my()`.

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cd frontend && npm test`
Expected: PASS, 4 теста.

- [ ] **Step 5: Коммит**

```bash
git add frontend/src
git commit -m "feat(frontend): add order detail page"
```

---

## Задача 6: Отклик исполнителя и «Мои отклики»

**Files:**
- Create: `frontend/src/api/proposals.ts`
- Create: `frontend/src/features/create-proposal/ProposalForm.tsx`, `schema.ts`, `ProposalForm.test.tsx`
- Create: `frontend/src/pages/my-proposals/MyProposalsPage.tsx`, `MyProposalsPage.test.tsx`
- Modify: `frontend/src/pages/order/OrderPage.tsx` — встроить форму и статус своего отклика
- Modify: `frontend/src/app/router.tsx` — `/my/proposals`

**Interfaces:**
- Consumes: `apiRequest`, `qk`, `formatMoney`, `Badge`.
- Produces:
  - `fetchMyProposals(): Promise<Array<Proposal & { order: Order }>>` → `GET /orders/proposals/my`
  - `createProposal(orderId: number, input: { proposed_price: number; message?: string }): Promise<Proposal>`
  - `withdrawProposal(proposalId: number): Promise<void>` → `DELETE /orders/proposals/{id}`
  - `<ProposalForm orderId: number; maxPrice?: number | null; onCreated(): void>`
  - `<MyProposalsPage>` — маршрут `/my/proposals`

- [ ] **Step 1: Написать падающие тесты**

`ProposalForm.test.tsx`:

```tsx
test('rejects zero price before sending')
test('sends price and message and calls onCreated')
test('blocks the submit button while the request is in flight')
test('shows daily limit message from api')
```

Третий тест: сервер отвечает `409` с `{"detail": {"message": "Превышен лимит откликов за день. Максимум 3 отклика в сутки", "code": "daily_proposal_limit"}}` — форма показывает этот текст и не очищается.

`MyProposalsPage.test.tsx`: рендерит список с ценами и статусами; у `pending` есть кнопка «Отозвать», у `accepted` — ссылка «Перейти в чат»; пустой список показывает подсказку «Вы ещё не откликались».

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd frontend && npm test`
Expected: FAIL — модулей нет.

- [ ] **Step 3: Реализовать API и форму**

`schema.ts`: `proposed_price` — число > 0, обязательно; `message` — до 1000 символов, необязательно.

`ProposalForm`: поля «Ваша цена» (число, подсказка с вилкой заказчика) и «Сообщение»; кнопка блокируется на время отправки (защита от двойного клика); ошибка `daily_proposal_limit` выводится плашкой, остальные — общим текстом; после успеха инвалидирует `qk.orders.detail(orderId)` и `qk.proposals.mine()`.

- [ ] **Step 4: Реализовать экран откликов**

`MyProposalsPage`: `useQuery(qk.proposals.mine)`; карточка: заказ, своя цена, статус, дата; действия по статусу. Пустое состояние по макету.

- [ ] **Step 5: Встроить в страницу заказа**

В `OrderPage` для чужого открытого заказа: если отклика нет — `ProposalForm`, если есть — карточка своего отклика со статусом и кнопкой «Отозвать» для `pending`.

- [ ] **Step 6: Убедиться, что тесты проходят**

Run: `cd frontend && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Проверить вживую**

Run: бэкенд и фронтенд.
Expected: отклик создаётся, появляется в «Мои отклики», четвёртый отклик за день показывает сообщение о лимите.

- [ ] **Step 8: Коммит**

```bash
git add frontend/src
git commit -m "feat(frontend): add proposal form and my proposals page"
```

---

## Задача 7: Отклики заказчика и принятие исполнителя

**Files:**
- Create: `frontend/src/features/accept-proposal/AcceptProposalDialog.tsx`, `ProposalList.tsx`, `ProposalList.test.tsx`
- Modify: `frontend/src/api/proposals.ts` — `fetchOrderProposals(orderId)`, `acceptProposal(orderId, proposalId)`
- Modify: `frontend/src/pages/order/OrderPage.tsx` — секция откликов для владельца
- Modify: `frontend/src/pages/my-orders/MyOrdersPage.tsx` (создаётся здесь же)

**Interfaces:**
- Produces:
  - `fetchOrderProposals(orderId: number): Promise<Proposal[]>` → `GET /orders/{id}/proposals`
  - `acceptProposal(orderId: number, proposalId: number): Promise<Proposal>` → `POST /orders/{id}/proposals/{proposalId}/accept`
  - `<ProposalList order: Order; proposals: Proposal[]; onAccepted(): void>`

- [ ] **Step 1: Написать падающие тесты**

`ProposalList.test.tsx`:

```tsx
test('accept asks for confirmation and warns that others will be rejected', async () => {
  const onAccepted = vi.fn()
  render(<ProposalList order={ownOpenOrder} proposals={[pendingProposal]} onAccepted={onAccepted} />, { wrapper: TestProviders })

  await userEvent.click(screen.getByRole('button', { name: 'Принять' }))

  expect(screen.getByText(/Остальные отклики будут отклонены/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Принять и открыть чат' }))
  await vi.waitFor(() => expect(onAccepted).toHaveBeenCalled())
})

test('conflict error is explained', async () => {
  server.use(http.post('/api/v1/orders/1/proposals/5/accept', () =>
    HttpResponse.json({ detail: { message: 'Исполнитель уже выбран или заказ закрыт', code: 'order_not_open' } }, { status: 409 })))
  // после подтверждения появляется текст ошибки и список перезапрашивается
})
```

Дополнительно: `OrderPage.test.tsx` — для своего открытого заказа появился заголовок «Отклики» и карточка отклика; тест на «Мои заказы» — группы по статусам и счётчик откликов из `proposals_count`.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd frontend && npm test`
Expected: FAIL.

- [ ] **Step 3: Реализовать список и принятие**

`ProposalList`: карточка отклика — имя исполнителя (из `GET /users/{id}` или заглушка, если недоступно), цена, сообщение, дата, статус; у `pending` — кнопка «Принять», открывающая `AcceptProposalDialog` с текстом «Остальные отклики будут отклонены, их чаты закроются».

`acceptProposal`: при успехе инвалидирует `qk.orders.detail`, `qk.orders.my()`, `qk.proposals.forOrder(orderId)` и переходит в чат, найденный по `order_id` в `qk.chats.list` (если список ещё не загружен — на `/chats`).

Ошибка `order_not_open`: плашка с текстом сервера и принудительный `refetch` заказа.

- [ ] **Step 4: Реализовать «Мои заказы»**

`MyOrdersPage` (`/my/orders`): в режиме заказчика — `fetchMyOrders()`, группы «Открытые», «В работе», «Закрытые», у каждой карточки `proposals_count`; в режиме исполнителя — `fetchMyProposals()` с `status === 'accepted'`, группы «В работе» и «Завершённые».

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `cd frontend && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Коммит**

```bash
git add frontend/src
git commit -m "feat(frontend): add proposals list, accept flow and my orders"
```

---

## Задача 8: Создание и редактирование заказа

**Files:**
- Create: `frontend/src/shared/config/trees.ts` (если ещё нет — из задачи 3)
- Create: `frontend/src/api/uploads.ts`
- Create: `frontend/src/features/pick-point/PickPointMap.tsx`
- Create: `frontend/src/features/upload-photos/PhotoUploader.tsx`
- Create: `frontend/src/pages/order-edit/OrderEditPage.tsx`, `schema.ts`, `draft.ts`
- Create: `frontend/src/pages/order-edit/OrderEditPage.test.tsx`
- Modify: `frontend/src/api/orders.ts` — `createOrder`, `updateOrder`
- Modify: `frontend/src/app/router.tsx` — `/orders/new`, `/orders/:id/edit`

**Interfaces:**
- Produces:
  - `uploadImage(file: File): Promise<string>` → `POST /uploads/images`, возвращает `url`
  - `createOrder(input: OrderInput): Promise<Order>` → `POST /orders/`; `updateOrder(id: number, input: Partial<OrderInput>): Promise<Order>` → `PATCH /orders/{id}`
  - `interface OrderInput { title: string; description: string; min_price: number | null; max_price: number | null; deadline: string; address: string; tree_type: string; tree_height: number; tree_diameter: number; photos: string[]; lat: number; lon: number }`
  - `saveDraft(input: Partial<OrderInput>): void`, `loadDraft(): Partial<OrderInput> | null`, `clearDraft(): void`

- [ ] **Step 1: Написать падающие тесты**

`OrderEditPage.test.tsx`:

```tsx
test('rejects title shorter than five characters')
test('rejects deadline in the past')
test('restores draft after remount')
test('uploads photo and keeps other photos when one fails')
test('rejects a file larger than five megabytes before upload')
test('requires a point on the map before submit')
```

Тест загрузки: `POST /api/v1/uploads/images` для первого файла отвечает `500`, для второго — `{"url": "/media/a.jpg"}`; после попытки на экране остаётся одно успешное фото и кнопка «Повторить» у неудачного.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd frontend && npm test`
Expected: FAIL.

- [ ] **Step 3: Реализовать схему и черновик**

`schema.ts` (zod): `title` 5–200, `description` ≥ 10, `min_price`/`max_price` ≥ 0 и `min <= max`, `deadline` в будущем, `address` 5–500, `tree_type` 1–50, `tree_height` > 0, `tree_diameter` > 0, `lat`/`lon` обязательны.

`draft.ts`: сохранение в `localStorage` (`gisorders.draft`) с debounce 500 мс; очистка после успешного создания.

- [ ] **Step 4: Реализовать фото и точку**

`PhotoUploader`: до 5 файлов; проверка типа (`image/*`) и размера (≤ 5 МБ) до отправки с понятным текстом; сжатие через `canvas` до 1920 px по длинной стороне; превью сразу, параллельная загрузка, повтор для упавших; drag-and-drop и выбор с камеры (`capture="environment"`).

`PickPointMap`: Leaflet, клик ставит маркер, координаты пишутся в форму; кнопка «Моё местоположение».

- [ ] **Step 5: Реализовать экран**

`OrderEditPage`: режим создания и редактирования по наличию `:id`; комбобокс породы (подсказки из `TREE_TYPES`, свободный ввод разрешён); поля по спеке; при редактировании занятого заказа поля заблокированы с пояснением; кнопка «Опубликовать»/«Сохранить» блокируется на время запроса; после успеха — переход на `/orders/:id` и инвалидация `qk.orders.my()` и `qk.orders.available`.

- [ ] **Step 6: Убедиться, что тесты проходят**

Run: `cd frontend && npm test && npm run typecheck`
Expected: PASS, 6 тестов.

- [ ] **Step 7: Проверить вживую**

Run: бэкенд и фронтенд.
Expected: заказ создаётся с фото, точка сохраняется, редактирование меняет поля, черновик восстанавливается после перезагрузки.

- [ ] **Step 8: Коммит**

```bash
git add frontend/src
git commit -m "feat(frontend): add order create and edit with photos and map point"
```

---

## Задача 9: Чаты и realtime

**Files:**
- Create: `frontend/src/api/chats.ts`
- Create: `frontend/src/features/chat/socket.ts`, `socket.test.ts`, `group.ts`, `group.test.ts`
- Create: `frontend/src/pages/chats/ChatsPage.tsx`, `frontend/src/pages/chat/ChatPage.tsx`, `ChatPage.test.tsx`
- Modify: `frontend/src/app/router.tsx` — `/chats`, `/chats/:id`
- Modify: `frontend/src/widgets/app-shell/nav-items.ts` — бейдж непрочитанных на «Чатах»

**Interfaces:**
- Consumes: `apiRequest`, `getAccessToken`, `qk`, `formatDeadline`.
- Produces:
  - `fetchChats(): Promise<Chat[]>` → `GET /chats/my`
  - `fetchChat(id: number): Promise<Chat & { messages: Message[] }>` → `GET /chats/{id}`
  - `fetchUnreadCount(): Promise<number>` → `GET /chats/unread/count`
  - `sendMessage(chatId: number, text: string): Promise<Message>` → `POST /chats/{id}/messages`
  - `markChatRead(chatId: number): Promise<void>` → `POST /chats/{id}/read`
  - `nextReconnectDelay(attempt: number): number` — 1000 мс × 2^attempt, потолок 30 000, джиттер ±20 %
  - `groupMessagesByDay(messages: Message[]): Array<{ day: string; messages: Message[] }>`
  - `createChatSocket(options: { chatId: number; getToken(): string | null; onEvent(event: ChatEvent): void; onStatus(status: 'online' | 'offline'): void }): { close(): void }`
  - `type ChatEvent = { type: 'message.created'; message: Message } | { type: 'message.read'; message_id: number } | { type: 'typing'; user_id: number; is_typing: boolean }`

- [ ] **Step 1: Написать падающие тесты**

`socket.test.ts`:

```ts
test('reconnect delay grows and is capped', () => {
  expect(nextReconnectDelay(0)).toBeGreaterThanOrEqual(800)
  expect(nextReconnectDelay(0)).toBeLessThanOrEqual(1200)
  expect(nextReconnectDelay(10)).toBeLessThanOrEqual(36000)
})
```

Реализация с джиттером: проверять диапазон, а не точное значение.

`group.test.ts`: сообщения разных дней дают две группы; внутри группы порядок сохраняется.

`ChatPage.test.tsx`:

```tsx
test('sends message optimistically and rolls back on failure')
test('groups messages by day and shows own messages on the right')
test('shows offline banner and reconnects')
```

Первый тест: `POST /chats/1/messages` отвечает `500` — сообщение исчезает из списка, показывается ошибка «Не удалось отправить».

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `frontend && npm test`
Expected: FAIL.

- [ ] **Step 3: Реализовать API и сокет**

`chats.ts` — методы из интерфейсов выше.

`socket.ts`: `new WebSocket(`${WS_BASE}/ws/chats/${chatId}`)`, где `WS_BASE` = `VITE_WS_URL` или `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/v1`; первый кадр `{"type":"auth","token":getToken()}`; сервер отвечает `{"type":"auth.ok"}`; на `close` — переподключение через `nextReconnectDelay` с джиттером; на `open` — `onStatus('online')` и повторная авторизация; коды закрытия `4401`/`4403`/`4404` означают отказ авторизации/доступа — при `4401` обновить токен и переподключиться, при `4403`/`4404` не переподключаться и показать ошибку; `close()` отменяет таймеры.

`WS_BASE` — из `VITE_WS_URL` (если задан) или из `location.origin` с заменой схемы на `ws` и обязательным префиксом `/api/v1` (эндпоинт — `/api/v1/ws/chats/{id}`).

- [ ] **Step 4: Реализовать экраны**

`ChatsPage`: список чатов, аватар-заглушка с инициалами, имя собеседника, последнее сообщение (обрезка), время, бейдж непрочитанных; сортировка по `updated_at`; пустое состояние «Пока нет переписок».

`ChatPage`: заголовок с именем и ссылкой на заказ; сообщения сгруппированы по дням с разделителями; свои — справа (`bg-moss-600 text-white`), чужие — слева (`bg-card border`); `Enter` — отправить, `Shift+Enter` — перенос; кнопка отправки 44×44; автоскролл вниз, если пользователь уже внизу; индикатор «печатает» по событию `typing` с затуханием 3 секунды; баннер «Нет связи, переподключаемся»; при открытии — `markChatRead` и инвалидация списка.

Бейдж на пункте «Чаты» в оболочке: `useQuery(qk.chats.unread, { refetchInterval: 60_000, staleTime: 30_000 })`, скрывается при нуле; после `markChatRead` и прихода нового сообщения — инвалидация `qk.chats.unread`.

- [ ] **Step 5: Убедиться, что тесты проходят**

Run: `cd frontend && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Проверить вживую двумя браузерами**

Run: бэкенд и фронтенд, два профиля браузера, чат между заказчиком и исполнителем.
Expected: сообщения приходят мгновенно, отметка прочтения обновляет бейдж, разрыв сети (DevTools → Offline) показывает баннер и восстанавливается.

- [ ] **Step 7: Коммит**

```bash
git add frontend/src
git commit -m "feat(frontend): add chats with realtime updates"
```

---

## Задача 10: Профиль

**Files:**
- Create: `frontend/src/pages/profile/ProfilePage.tsx`, `PasswordForm.tsx`, `DeleteAccountDialog.tsx`
- Create: `frontend/src/features/auth/profile-api.ts`
- Create: `frontend/src/pages/profile/ProfilePage.test.tsx`
- Modify: `frontend/src/app/router.tsx` — `/profile` рендерит `ProfilePage`

**Interfaces:**
- Produces:
  - `updateProfile(input: { username?: string; phone_number?: string | null }): Promise<User>` → `PATCH /users/me`
  - `changePassword(input: { current_password: string; new_password: string }): Promise<void>` → `POST /users/me/password`
  - `deleteAccount(): Promise<void>` → `DELETE /users/me`

- [ ] **Step 1: Написать падающие тесты**

```tsx
test('password form rejects short or weak passwords')
test('password form mirrors backend rules with hints')
test('delete account requires typing the confirmation word')
test('logout calls api and redirects to login')
```

Проверки: пароль «password» отклоняется с текстами «минимум 8 символов», «заглавная буква», «цифра»; кнопка «Удалить аккаунт» неактивна, пока в поле не введено «удалить».

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `cd frontend && npm test`
Expected: FAIL.

- [ ] **Step 3: Реализовать экран**

`ProfilePage`: карточка пользователя (аватар с инициалами, имя, email, телефон), форма редактирования имени и телефона, секция «Безопасность» со сменой пароля, переключатель ролей с пояснением «Один аккаунт — обе роли», выход, удаление аккаунта.

Смена пароля: после успеха бэкенд отзывает все сессии — показать «Пароль изменён. Войдите заново» и перевести на `/login` после подтверждения.

`DeleteAccountDialog`: поле ввода, сравнение с «удалить» без учёта регистра и пробелов, кнопка активируется только при совпадении; после удаления — очистка сессии и переход на `/login`.

- [ ] **Step 4: Убедиться, что тесты проходят**

Run: `cd frontend && npm test && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add frontend/src
git commit -m "feat(frontend): add profile, password change and account deletion"
```

---

## Задача 11: E2E и финальная проверка

**Files:**
- Modify: `frontend/package.json` — `@playwright/test`, скрипт `e2e`
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/auth-feed-proposal.spec.ts`, `create-order.spec.ts`, `accept-and-chat.spec.ts`
- Create: `frontend/README.md` — как поднять, тестировать и собирать

**Interfaces:**
- Consumes: готовое приложение и запущенный бэкенд.
- Produces: три зелёных e2e-сценария и инструкция запуска.

- [ ] **Step 1: Настроить Playwright**

`playwright.config.ts`: `testDir: './e2e'`, `baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173'`, `webServer` — `npm run dev` (переиспользовать существующий сервер), `use: { trace: 'retain-on-failure' }`, проекты `desktop-chrome` и `mobile-safari` (iPhone 13).

- [ ] **Step 2: Написать сценарий «вход → лента → отклик → чат»**

```ts
test('executor finds an order and starts a chat', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill(process.env.E2E_EXECUTOR_EMAIL!)
  await page.getByLabel('Пароль').fill(process.env.E2E_PASSWORD!)
  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('heading', { name: 'Заказы рядом' })).toBeVisible()
  await page.getByRole('link', { name: /Спилить/ }).first().click()
  await page.getByRole('button', { name: 'Откликнуться' }).click()
  await page.getByLabel('Ваша цена').fill('3000')
  await page.getByRole('button', { name: 'Отправить отклик' }).click()
  await expect(page.getByText('Ожидает')).toBeVisible()
})
```

Данные для входа — из переменных окружения; в `frontend/README.md` описать, как создать двух пользователей и заказ через `backend/seed_db.py`.

- [ ] **Step 3: Написать сценарий создания заказа**

Заказчик: вход → «+» → форма → название, описание, цена, срок, адрес, порода, высота, диаметр, точка на карте → «Опубликовать» → страница заказа со статусом «Открыт».

- [ ] **Step 4: Написать сценарий принятия и чата**

Заказчик принимает отклик, попадает в чат, пишет сообщение; исполнитель видит его в своей вкладке чата.

- [ ] **Step 5: Прогнать e2e**

Run: `cd frontend && npx playwright install --with-deps && npm run e2e`
Expected: 3 сценария PASS в обоих проектах.

- [ ] **Step 6: Финальная проверка всего**

- [ ] `cd backend && uv run pytest --cov=api --cov=core --cov-report=term-missing` — PASS, ≥ 75%.
- [ ] `cd backend && uv run ruff check .` — чисто.
- [ ] `cd frontend && npm test && npm run typecheck && npm run build` — PASS.
- [ ] `docker compose -f docker-compose.prod.yml up -d --build` — фронтенд открывается на `http://localhost:8080`, вход работает, `/api` и `/media` проксируются.
- [ ] Ручная проверка на 360 px, 768 px, 1440 px.
- [ ] Клавиатурная навигация по формам и модалкам, `Esc` закрывает.

- [ ] **Step 7: Коммит**

```bash
git add frontend
git commit -m "test(frontend): add e2e scenarios and frontend readme"
```

---

## Проверка плана

- [ ] Все девять экранов из спеки реализованы и доступны по маршрутам.
- [ ] Каждый список имеет состояния загрузки, пустоты и ошибки.
- [ ] Ни один компонент не вызывает `fetch` напрямую.
- [ ] Все цвета — из токенов; ни одного hex в компонентах.
- [ ] `npm run typecheck` и `npm test` зелёные.
