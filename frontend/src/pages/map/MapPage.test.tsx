import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import type { Order } from '@/api/types'
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
  localStorage.setItem(STORAGE_KEYS.point, JSON.stringify(point))
})

afterEach(() => {
  server.resetHandlers()
  localStorage.clear()
  Reflect.deleteProperty(navigator, 'geolocation')
})

afterAll(() => server.close())

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
