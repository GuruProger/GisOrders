import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Order } from '@/api/types'
import { STORAGE_KEYS } from '@/shared/lib/storage'
import { server } from '@/test/msw'
import { TestProviders } from '@/test/providers'
import { FeedPage } from './FeedPage'

const point = { lat: 55.75, lon: 37.61 }

const order: Order = {
  id: 1,
  title: 'Спилить сухое дерево',
  description: 'Дерево во дворе',
  min_price: 2000,
  max_price: 3000,
  deadline: '2027-12-01T10:00:00Z',
  address: 'Москва, ул. Лесная, 1',
  tree_type: 'сосна',
  tree_height: 12,
  tree_diameter: 35,
  photos: null,
  status: 'open',
  created_at: '2026-10-01T10:00:00Z',
  closed_at: null,
  customer_id: 2,
  accepted_proposal_id: null,
  lat: 55.7658,
  lon: 37.6173,
  proposals_count: 3,
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

beforeEach(() => {
  localStorage.setItem(STORAGE_KEYS.point, JSON.stringify(point))
})

afterEach(() => {
  server.resetHandlers()
  localStorage.clear()
  Reflect.deleteProperty(navigator, 'geolocation')
})

afterAll(() => server.close())

test('renders first page of orders', async () => {
  server.use(
    http.get('/api/v1/orders/available', () =>
      HttpResponse.json([order], { headers: { 'X-Total-Count': '12' } }),
    ),
  )

  render(<FeedPage />, { wrapper: TestProviders })

  expect(await screen.findByText('Спилить сухое дерево')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Заказы рядом' })).toBeInTheDocument()
  expect(screen.getByText('12 заказов · 10 км')).toBeInTheDocument()
  expect(screen.getByRole('list')).toBeInTheDocument()
})

test('empty feed suggests widening the radius', async () => {
  server.use(
    http.get('/api/v1/orders/available', () =>
      HttpResponse.json([], { headers: { 'X-Total-Count': '0' } }),
    ),
  )

  render(<FeedPage />, { wrapper: TestProviders })

  expect(await screen.findByText(/заказов нет/i)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Увеличить радиус' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Сбросить фильтры' })).toBeInTheDocument()
})

test('widening the radius raises it to the next step and refetches', async () => {
  const radii: (string | null)[] = []
  server.use(
    http.get('/api/v1/orders/available', ({ request }) => {
      radii.push(new URL(request.url).searchParams.get('radius_km'))
      return HttpResponse.json([], { headers: { 'X-Total-Count': '0' } })
    }),
  )

  render(<FeedPage />, { wrapper: TestProviders })

  await screen.findByText(/заказов нет/i)
  await userEvent.click(screen.getByRole('button', { name: 'Увеличить радиус' }))

  await vi.waitFor(() => expect(radii).toEqual(['10', '25']))
})

test('resetting filters restores defaults but keeps the point', async () => {
  const requests: URL[] = []
  server.use(
    http.get('/api/v1/orders/available', ({ request }) => {
      requests.push(new URL(request.url))
      return HttpResponse.json([], { headers: { 'X-Total-Count': '0' } })
    }),
  )

  render(<FeedPage />, {
    wrapper: ({ children }) => (
      <TestProviders initialEntries={['/?radius=25&min=100']}>{children}</TestProviders>
    ),
  })

  await screen.findByText(/заказов нет/i)
  await userEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }))

  await vi.waitFor(() => {
    const last = requests.at(-1)
    expect(last?.searchParams.get('radius_km')).toBe('10')
    expect(last?.searchParams.get('min_price')).toBeNull()
    expect(last?.searchParams.get('user_lat')).toBe('55.75')
    expect(last?.searchParams.get('user_lon')).toBe('37.61')
  })
})

test('asks for a location when the point is unknown', async () => {
  localStorage.clear()
  Reflect.deleteProperty(navigator, 'geolocation')

  render(<FeedPage />, { wrapper: TestProviders })

  expect(await screen.findByText('Укажите, где искать')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Разрешить геолокацию' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Выбрать на карте' })).toHaveAttribute('href', '/map')
})

test('toolbar opens the sheet and applying a radius updates the request', async () => {
  const requests: URL[] = []
  server.use(
    http.get('/api/v1/orders/available', ({ request }) => {
      requests.push(new URL(request.url))
      return HttpResponse.json([], { headers: { 'X-Total-Count': '4' } })
    }),
  )

  render(<FeedPage />, { wrapper: TestProviders })

  expect(screen.getByRole('link', { name: 'Карта' })).toHaveAttribute('href', '/map')
  await userEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
  await userEvent.click(screen.getByRole('radio', { name: '25 км' }))
  await userEvent.click(screen.getByRole('button', { name: 'Показать 4' }))

  await vi.waitFor(() => {
    expect(requests.at(-1)?.searchParams.get('radius_km')).toBe('25')
  })
})

test('persists a point picked in the sheet and searches around it', async () => {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (success: PositionCallback) => {
        success({
          coords: {
            latitude: 50,
            longitude: 30,
            accuracy: 5,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        } as unknown as GeolocationPosition)
      },
    },
  })

  const requests: URL[] = []
  server.use(
    http.get('/api/v1/orders/available', ({ request }) => {
      requests.push(new URL(request.url))
      return HttpResponse.json([], { headers: { 'X-Total-Count': '4' } })
    }),
  )

  render(<FeedPage />, { wrapper: TestProviders })

  await screen.findByText(/заказов нет/i)
  await userEvent.click(screen.getByRole('button', { name: 'Фильтры' }))
  await userEvent.click(screen.getByRole('button', { name: 'Моё местоположение' }))
  await screen.findByText('Точка обновлена')
  await userEvent.click(screen.getByRole('button', { name: 'Показать 4' }))

  await vi.waitFor(() => {
    const last = requests.at(-1)
    expect(last?.searchParams.get('user_lat')).toBe('50')
    expect(last?.searchParams.get('user_lon')).toBe('30')
  })
  expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.point) ?? 'null')).toEqual({
    lat: 50,
    lon: 30,
  })
})

test('search is written to the url and shows the no-results state', async () => {
  const searches: (string | null)[] = []
  server.use(
    http.get('/api/v1/orders/available', ({ request }) => {
      searches.push(new URL(request.url).searchParams.get('search'))
      return HttpResponse.json([], { headers: { 'X-Total-Count': '0' } })
    }),
  )

  render(<FeedPage />, { wrapper: TestProviders })

  await userEvent.type(screen.getByLabelText('Поиск заказов'), 'спил')

  expect(await screen.findByText('По запросу ничего не найдено')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Сбросить фильтры' })).toBeInTheDocument()
  await vi.waitFor(() => expect(searches.at(-1)).toBe('спил'))
})

test('removing an active filter chip keeps the rest and refetches', async () => {
  const requests: URL[] = []
  server.use(
    http.get('/api/v1/orders/available', ({ request }) => {
      requests.push(new URL(request.url))
      return HttpResponse.json([], { headers: { 'X-Total-Count': '0' } })
    }),
  )

  render(<FeedPage />, {
    wrapper: ({ children }) => (
      <TestProviders initialEntries={['/?radius=25&tree=сосна']}>{children}</TestProviders>
    ),
  })

  await screen.findByText(/заказов нет/i)
  await userEvent.click(screen.getByRole('button', { name: 'Убрать фильтр Порода' }))

  await vi.waitFor(() => {
    const last = requests.at(-1)
    expect(last?.searchParams.get('radius_km')).toBe('25')
    expect(last?.searchParams.get('tree_type')).toBeNull()
  })
})

test('loads next page on demand', async () => {
  let calls = 0
  const pages: (string | null)[] = []
  server.use(
    http.get('/api/v1/orders/available', ({ request }) => {
      calls += 1
      const page = new URL(request.url).searchParams.get('page')
      pages.push(page)
      return HttpResponse.json([{ ...order, id: Number(page) }], {
        headers: { 'X-Total-Count': '25' },
      })
    }),
  )

  render(<FeedPage />, { wrapper: TestProviders })
  await screen.findByText('Спилить сухое дерево')

  await userEvent.click(screen.getByRole('button', { name: 'Показать ещё' }))

  await vi.waitFor(() => expect(calls).toBe(2))
  expect(pages).toEqual(['1', '2'])
})
