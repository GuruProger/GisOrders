import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Order } from '@/api/types'
import { setRoleMode } from '@/features/switch-role/model'
import { STORAGE_KEYS } from '@/shared/lib/storage'
import { mapApi, resetMapApi } from '@/test/mapMocks'
import { server } from '@/test/msw'
import { TestProviders } from '@/test/providers'
import { MapPage } from './MapPage'

vi.mock('react-leaflet', () => import('@/test/mapMocks'))
vi.mock('@/widgets/map/MarkerClusterGroup', () => import('@/test/mapMocks'))

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
  resetMapApi()
  setRoleMode('customer')
  localStorage.setItem(STORAGE_KEYS.point, JSON.stringify(point))
})

afterEach(() => {
  server.resetHandlers()
  localStorage.clear()
  Reflect.deleteProperty(navigator, 'geolocation')
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
})

afterAll(() => server.close())

const emptyPage = http.get('/api/v1/orders/available', () =>
  HttpResponse.json([], { headers: { 'X-Total-Count': '0' } }),
)

/** jsdom has no geolocation: tests install the minimal shape `requestGeolocation` uses. */
function mockGeolocation(getCurrentPosition: Geolocation['getCurrentPosition']): void {
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition },
  })
}

function position(lat: number, lon: number): GeolocationPosition {
  return {
    coords: {
      latitude: lat,
      longitude: lon,
      accuracy: 5,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  } as GeolocationPosition
}

function positionError(): GeolocationPositionError {
  return {
    code: 1,
    message: 'denied',
    PERMISSION_DENIED: 1,
    POSITION_UNAVAILABLE: 2,
    TIMEOUT: 3,
  } as GeolocationPositionError
}

test('renders the found orders on the map and links markers to cards', async () => {
  server.use(
    http.get('/api/v1/orders/available', () =>
      HttpResponse.json([order], { headers: { 'X-Total-Count': '1' } }),
    ),
  )

  render(<MapPage />, { wrapper: TestProviders })

  await screen.findByText('Спилить сухое дерево')

  const card = screen.getByText('Спилить сухое дерево').closest('[role="listitem"]')
    ?.firstElementChild
  expect(card).not.toHaveClass('ring-2')

  await userEvent.click(screen.getByRole('button', { name: '2\u00A0000\u00A0₽' }))

  expect(card).toHaveClass('ring-2')
})

test('asks for a point, then searches around the picked one', async () => {
  localStorage.clear()
  Reflect.deleteProperty(navigator, 'geolocation')
  server.use(
    http.get('/api/v1/orders/available', () =>
      HttpResponse.json([order], { headers: { 'X-Total-Count': '1' } }),
    ),
  )

  render(<MapPage />, { wrapper: TestProviders })

  expect(screen.getByText('Выберите точку на карте')).toBeInTheDocument()
  const searchHere = screen.getByRole('button', { name: 'Искать здесь' })
  expect(searchHere).toBeDisabled()

  act(() => {
    mapApi.click?.({ latlng: { lat: 55.7, lng: 37.6 } })
  })

  expect(screen.getByRole('button', { name: 'Точка поиска' })).toBeInTheDocument()
  expect(searchHere).toBeEnabled()

  await userEvent.click(searchHere)

  await screen.findByText('Спилить сухое дерево')
  expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.point) ?? 'null')).toEqual({
    lat: 55.7,
    lon: 37.6,
  })
})

test('shows an error state with a retry action', async () => {
  server.use(
    http.get('/api/v1/orders/available', () => new HttpResponse(null, { status: 500 })),
  )

  render(<MapPage />, { wrapper: TestProviders })

  expect(await screen.findByText('Не удалось загрузить заказы')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument()
})

test('a customer without orders is pointed to «Мои заказы»', async () => {
  setRoleMode('customer')
  server.use(emptyPage)

  render(<MapPage />, { wrapper: TestProviders })

  expect(await screen.findByText('В радиусе 10 км заказов нет')).toBeInTheDocument()
  expect(
    screen.getByText(/Попробуйте сдвинуть точку поиска или увеличить радиус/),
  ).toBeInTheDocument()
  expect(screen.getByText(/Карта показывает заказы других заказчиков/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Мои заказы' })).toHaveAttribute(
    'href',
    '/my/orders',
  )
})

test('an executor without orders keeps the generic empty state', async () => {
  setRoleMode('executor')
  server.use(emptyPage)

  render(<MapPage />, { wrapper: TestProviders })

  expect(await screen.findByText('В радиусе 10 км заказов нет')).toBeInTheDocument()
  expect(screen.getByText(/Попробуйте сдвинуть точку поиска или увеличить радиус/)).toBeInTheDocument()
  expect(screen.queryByText(/Карта показывает заказы других заказчиков/)).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Мои заказы' })).not.toBeInTheDocument()
})

test('the location button searches around the fresh point', async () => {
  mockGeolocation((success) => success(position(50, 30)))

  const requests: URL[] = []
  server.use(
    http.get('/api/v1/orders/available', ({ request }) => {
      requests.push(new URL(request.url))
      return HttpResponse.json([], { headers: { 'X-Total-Count': '0' } })
    }),
  )

  render(<MapPage />, { wrapper: TestProviders })

  await screen.findByText('В радиусе 10 км заказов нет')
  await userEvent.click(screen.getByRole('button', { name: 'Моё местоположение' }))

  await vi.waitFor(() => {
    const last = requests.at(-1)
    expect(last?.searchParams.get('user_lat')).toBe('50')
    expect(last?.searchParams.get('user_lon')).toBe('30')
  })
  expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.point) ?? 'null')).toEqual({
    lat: 50,
    lon: 30,
  })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('the location button is busy while asking and ignores repeat clicks', async () => {
  const pending: { success: PositionCallback | null } = { success: null }
  const getCurrentPosition = vi.fn((success: PositionCallback) => {
    pending.success = success
  })
  mockGeolocation(getCurrentPosition)

  server.use(
    http.get('/api/v1/orders/available', () =>
      HttpResponse.json([order], { headers: { 'X-Total-Count': '1' } }),
    ),
  )

  render(<MapPage />, { wrapper: TestProviders })

  await screen.findByText('Спилить сухое дерево')
  const button = screen.getByRole('button', { name: 'Моё местоположение' })

  await userEvent.click(button)

  expect(button).toBeDisabled()
  expect(button).toHaveAttribute('aria-busy', 'true')

  fireEvent.click(button)
  expect(getCurrentPosition).toHaveBeenCalledTimes(1)

  await act(async () => {
    pending.success?.(position(50, 30))
  })

  await vi.waitFor(() => expect(button).toBeEnabled())
})

test('a denied geolocation keeps the map and reports it inline', async () => {
  mockGeolocation((_success, error) => error?.(positionError()))

  server.use(
    http.get('/api/v1/orders/available', () =>
      HttpResponse.json([order], { headers: { 'X-Total-Count': '1' } }),
    ),
  )

  render(<MapPage />, { wrapper: TestProviders })

  await screen.findByText('Спилить сухое дерево')
  await userEvent.click(screen.getByRole('button', { name: 'Моё местоположение' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('Геолокация недоступна')
  expect(screen.getByText('Спилить сухое дерево')).toBeInTheDocument()
  expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.point) ?? 'null')).toEqual(point)
})

test('selecting a marker scrolls the card ribbon to its card', async () => {
  const scrollIntoView = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  })

  server.use(
    http.get('/api/v1/orders/available', () =>
      HttpResponse.json([order], { headers: { 'X-Total-Count': '1' } }),
    ),
  )

  render(<MapPage />, { wrapper: TestProviders })

  await screen.findByText('Спилить сухое дерево')
  const card = screen.getByText('Спилить сухое дерево').closest('[data-order-id]')
  expect(card).toHaveAttribute('data-order-id', '1')

  await userEvent.click(screen.getByRole('button', { name: '2\u00A0000\u00A0₽' }))

  expect(scrollIntoView).toHaveBeenCalledWith(
    expect.objectContaining({ inline: 'center', block: 'nearest' }),
  )
})
