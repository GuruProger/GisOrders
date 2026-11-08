import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router'
import type { Order, User } from '@/api/types'
import { useSession } from '@/features/auth/session'
import { STORAGE_KEYS } from '@/shared/lib/storage'
import { mapApi, resetMapApi } from '@/test/mapMocks'
import { server } from '@/test/msw'
import { TestProviders } from '@/test/providers'
import { OrderEditPage } from './OrderEditPage'

vi.mock('react-leaflet', () => import('@/test/mapMocks'))
vi.mock('@/widgets/map/MarkerClusterGroup', () => import('@/test/mapMocks'))

const user: User = {
  id: 2,
  email: 'customer@example.com',
  username: 'customer',
  phone_number: null,
  is_admin: false,
  is_active: true,
}

const order: Order = {
  id: 1,
  title: 'Спилить сухое дерево',
  description: 'Дерево во дворе, нужен аккуратный спил.',
  min_price: 2000,
  max_price: 3500,
  deadline: '2027-12-01T10:00:00Z',
  address: 'Москва, ул. Лесная, 1',
  tree_type: 'сосна',
  tree_height: 12,
  tree_diameter: 35,
  photos: null,
  status: 'open',
  created_at: '2026-10-01T10:00:00Z',
  closed_at: null,
  customer_id: user.id,
  accepted_proposal_id: null,
  lat: 55.751,
  lon: 37.618,
  proposals_count: 0,
}

const FUTURE_DEADLINE = '2099-12-01T10:00'

function renderCreate() {
  return render(
    <TestProviders initialEntries={['/orders/new']}>
      <Routes>
        <Route path="/orders/new" element={<OrderEditPage />} />
        <Route path="/orders/:id/edit" element={<OrderEditPage />} />
        <Route path="/orders/:id" element={<p>Карточка заказа</p>} />
      </Routes>
    </TestProviders>,
  )
}

function renderEdit(id: number) {
  return render(
    <TestProviders initialEntries={[`/orders/${id}/edit`]}>
      <Routes>
        <Route path="/orders/new" element={<OrderEditPage />} />
        <Route path="/orders/:id/edit" element={<OrderEditPage />} />
        <Route path="/orders/:id" element={<p>Карточка заказа</p>} />
      </Routes>
    </TestProviders>,
  )
}

async function fillBaseForm(values: {
  title?: string
  description?: string
  address?: string
  deadline?: string
} = {}) {
  await userEvent.type(
    screen.getByLabelText('Название'),
    values.title ?? 'Спилить сухое дерево',
  )
  await userEvent.type(
    screen.getByLabelText('Описание'),
    values.description ?? 'Дерево во дворе, нужен аккуратный спил.',
  )
  await userEvent.type(
    screen.getByLabelText('Адрес'),
    values.address ?? 'Москва, ул. Лесная, 1',
  )
  await userEvent.type(screen.getByLabelText('Порода'), 'сосна')
  await userEvent.type(screen.getByLabelText('Высота, м'), '12')
  await userEvent.type(screen.getByLabelText('Диаметр, см'), '35')
  fireEvent.change(screen.getByLabelText('Срок'), {
    target: { value: values.deadline ?? FUTURE_DEADLINE },
  })
}

async function pickPoint(lat = 55.75, lon = 37.61) {
  await act(async () => {
    mapApi.click?.({ latlng: { lat, lng: lon } })
  })
}

function imageFile(name: string): File {
  return new File(['image-bytes'], name, { type: 'image/png' })
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

beforeEach(() => {
  localStorage.clear()
  resetMapApi()
  useSession.setState({ user, status: 'authenticated' })
})

afterEach(() => {
  server.resetHandlers()
  useSession.getState().clear()
  localStorage.clear()
  vi.unstubAllGlobals()
})

afterAll(() => server.close())

test('rejects title shorter than five characters', async () => {
  let posted = 0
  server.use(
    http.post('/api/v1/orders/', () => {
      posted += 1
      return HttpResponse.json(order)
    }),
  )

  renderCreate()
  await fillBaseForm({ title: 'Саша' })
  await pickPoint()

  await userEvent.click(screen.getByRole('button', { name: 'Опубликовать' }))

  expect(
    await screen.findByText('Название должно быть не короче 5 символов'),
  ).toBeInTheDocument()
  expect(posted).toBe(0)
})

test('rejects deadline in the past', async () => {
  let posted = 0
  server.use(
    http.post('/api/v1/orders/', () => {
      posted += 1
      return HttpResponse.json(order)
    }),
  )

  renderCreate()
  await fillBaseForm({ deadline: '2020-01-01T10:00' })
  await pickPoint()

  await userEvent.click(screen.getByRole('button', { name: 'Опубликовать' }))

  expect(await screen.findByText('Срок должен быть в будущем')).toBeInTheDocument()
  expect(posted).toBe(0)
})

test('restores draft after remount', async () => {
  const { unmount } = renderCreate()

  await userEvent.type(screen.getByLabelText('Название'), 'Черновик заказа')
  await userEvent.type(
    screen.getByLabelText('Описание'),
    'Описание сохранённого черновика',
  )

  await waitFor(
    () => {
      const raw = localStorage.getItem(STORAGE_KEYS.draft)
      expect(raw).not.toBeNull()
      expect(JSON.parse(raw as string)).toMatchObject({ title: 'Черновик заказа' })
    },
    { timeout: 3_000 },
  )

  unmount()
  renderCreate()

  expect(screen.getByLabelText('Название')).toHaveValue('Черновик заказа')
  expect(screen.getByLabelText('Описание')).toHaveValue(
    'Описание сохранённого черновика',
  )
})

test('uploads photo and keeps other photos when one fails', async () => {
  let uploads = 0
  server.use(
    http.post('/api/v1/uploads/images', () => {
      uploads += 1
      if (uploads === 1) {
        return HttpResponse.json({ detail: 'Ошибка загрузки' }, { status: 500 })
      }
      return HttpResponse.json({
        url: '/media/a.jpg',
        width: 100,
        height: 80,
        size: 12,
        content_type: 'image/jpeg',
      })
    }),
  )

  renderCreate()
  await userEvent.upload(screen.getByLabelText('Фотографии'), [
    imageFile('first.png'),
    imageFile('second.png'),
  ])

  expect(await screen.findByRole('button', { name: 'Повторить' })).toBeInTheDocument()
  expect(await screen.findByRole('img', { name: 'Фотография 1' })).toHaveAttribute(
    'src',
    '/media/a.jpg',
  )
  expect(screen.getByRole('img', { name: 'first.png' })).toBeInTheDocument()
  expect(uploads).toBe(2)
})

test('rejects a file larger than five megabytes before upload', async () => {
  let uploads = 0
  server.use(
    http.post('/api/v1/uploads/images', () => {
      uploads += 1
      return HttpResponse.json({
        url: '/media/a.jpg',
        width: 100,
        height: 80,
        size: 12,
        content_type: 'image/jpeg',
      })
    }),
  )

  renderCreate()
  const huge = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.png', {
    type: 'image/png',
  })

  await userEvent.upload(screen.getByLabelText('Фотографии'), huge)

  expect(await screen.findByText(/Файл больше 5 МБ/)).toBeInTheDocument()
  expect(uploads).toBe(0)
})

test('requires a point on the map before submit', async () => {
  let posted = 0
  server.use(
    http.post('/api/v1/orders/', () => {
      posted += 1
      return HttpResponse.json(order)
    }),
  )

  renderCreate()
  await fillBaseForm()

  await userEvent.click(screen.getByRole('button', { name: 'Опубликовать' }))

  expect(await screen.findByText('Поставьте точку на карте')).toBeInTheDocument()
  expect(posted).toBe(0)
})

test('creates an order, clears the draft and navigates to it', async () => {
  let payload: Record<string, unknown> | undefined
  server.use(
    http.post('/api/v1/orders/', async ({ request }) => {
      payload = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ ...order, id: 42, ...payload })
    }),
  )

  renderCreate()
  await fillBaseForm()
  await pickPoint()

  await userEvent.click(screen.getByRole('button', { name: 'Опубликовать' }))

  expect(await screen.findByText('Карточка заказа')).toBeInTheDocument()
  expect(screen.getByText('Заказ опубликован')).toBeInTheDocument()
  expect(payload).toMatchObject({
    title: 'Спилить сухое дерево',
    min_price: null,
    max_price: null,
    lat: 55.75,
    lon: 37.61,
    photos: [],
  })
  expect(new Date(payload?.deadline as string).getTime()).toBe(
    new Date(FUTURE_DEADLINE).getTime(),
  )
  expect(localStorage.getItem(STORAGE_KEYS.draft)).toBeNull()
})

test('restores the draft point and photos and publishes them', async () => {
  let payload: Record<string, unknown> | undefined
  server.use(
    http.post('/api/v1/orders/', async ({ request }) => {
      payload = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ ...order, id: 43, ...payload })
    }),
  )

  const draft = {
    title: 'Черновик с точкой',
    description: 'Описание черновика с точкой и фотографией',
    min_price: '1000',
    max_price: '2000',
    deadline: FUTURE_DEADLINE,
    address: 'Санкт-Петербург, ул. Тестовая, 1',
    tree_type: 'берёза',
    tree_height: '8',
    tree_diameter: '20',
    point: { lat: 59.9, lon: 30.3 },
    photos: ['/media/draft.jpg'],
  }
  localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(draft))

  renderCreate()

  expect(screen.getByLabelText('Название')).toHaveValue(draft.title)
  expect(screen.getByRole('img', { name: 'Фотография 1' })).toHaveAttribute(
    'src',
    '/media/draft.jpg',
  )
  expect(screen.getByRole('button', { name: 'Точка заказа' })).toBeInTheDocument()

  // The mount effect must not overwrite the restored point and photos.
  await new Promise((resolve) => setTimeout(resolve, 700))
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.draft) as string)
  expect(stored.point).toEqual(draft.point)
  expect(stored.photos).toEqual(draft.photos)

  await userEvent.click(screen.getByRole('button', { name: 'Опубликовать' }))

  expect(await screen.findByText('Карточка заказа')).toBeInTheDocument()
  expect(payload).toMatchObject({
    lat: 59.9,
    lon: 30.3,
    photos: ['/media/draft.jpg'],
    min_price: 1000,
    max_price: 2000,
  })
})

test('keeps every photo when uploads finish together', async () => {
  let payload: Record<string, unknown> | undefined
  const releases: Array<() => void> = []
  let uploads = 0
  server.use(
    http.post('/api/v1/uploads/images', async () => {
      await new Promise<void>((resolve) => {
        releases.push(resolve)
      })
      uploads += 1
      return HttpResponse.json({
        url: `/media/${uploads}.jpg`,
        width: 100,
        height: 80,
        size: 12,
        content_type: 'image/jpeg',
      })
    }),
    http.post('/api/v1/orders/', async ({ request }) => {
      payload = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ ...order, id: 44, ...payload })
    }),
  )

  renderCreate()
  await userEvent.upload(screen.getByLabelText('Фотографии'), [
    imageFile('first.png'),
    imageFile('second.png'),
  ])

  await waitFor(() => expect(releases).toHaveLength(2))
  // Resolve both in one batch: reading a render snapshot here used to drop one.
  await act(async () => {
    for (const release of releases) release()
  })

  expect(await screen.findByRole('img', { name: 'Фотография 1' })).toBeInTheDocument()
  expect(await screen.findByRole('img', { name: 'Фотография 2' })).toBeInTheDocument()
  // Finished uploads leave the local list, so no duplicate preview remains.
  expect(screen.queryByRole('img', { name: 'first.png' })).not.toBeInTheDocument()
  expect(screen.queryByRole('img', { name: 'second.png' })).not.toBeInTheDocument()

  await fillBaseForm()
  await pickPoint()
  await userEvent.click(screen.getByRole('button', { name: 'Опубликовать' }))

  expect(await screen.findByText('Карточка заказа')).toBeInTheDocument()
  expect(payload?.photos).toHaveLength(2)
  expect(payload?.photos).toEqual(
    expect.arrayContaining(['/media/1.jpg', '/media/2.jpg']),
  )
})

test('blocks publishing until photos finish uploading', async () => {
  let posted = 0
  let release: (() => void) | null = null
  server.use(
    http.post('/api/v1/uploads/images', async () => {
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return HttpResponse.json({
        url: '/media/slow.jpg',
        width: 10,
        height: 10,
        size: 1,
        content_type: 'image/jpeg',
      })
    }),
    http.post('/api/v1/orders/', () => {
      posted += 1
      return HttpResponse.json(order)
    }),
  )

  renderCreate()
  await fillBaseForm()
  await pickPoint()
  await userEvent.upload(screen.getByLabelText('Фотографии'), imageFile('slow.png'))

  expect(await screen.findByText('Дождитесь загрузки фото')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Опубликовать' })).toBeDisabled()
  expect(posted).toBe(0)

  await act(async () => {
    release?.()
  })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Опубликовать' })).toBeEnabled(),
  )
})

test('saves an open order with PATCH and keeps another draft intact', async () => {
  let patched: Record<string, unknown> | undefined
  server.use(
    http.get('/api/v1/orders/1', () =>
      HttpResponse.json({ ...order, photos: ['/media/old.jpg'] }),
    ),
    http.patch('/api/v1/orders/1', async ({ request }) => {
      patched = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ ...order, ...patched })
    }),
  )
  localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify({ title: 'Другой черновик' }))

  renderEdit(1)
  const title = await screen.findByLabelText('Название')
  await userEvent.clear(title)
  await userEvent.type(title, 'Обновлённый заголовок')
  await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

  expect(await screen.findByText('Карточка заказа')).toBeInTheDocument()
  expect(patched).toMatchObject({
    title: 'Обновлённый заголовок',
    photos: ['/media/old.jpg'],
    lat: order.lat,
    lon: order.lon,
  })
  // Editing must not clear the create-mode draft of another order.
  expect(localStorage.getItem(STORAGE_KEYS.draft)).not.toBeNull()
})

test('rejects a maximum price below the minimum', async () => {
  let posted = 0
  server.use(
    http.post('/api/v1/orders/', () => {
      posted += 1
      return HttpResponse.json(order)
    }),
  )

  renderCreate()
  await fillBaseForm()
  fireEvent.change(screen.getByLabelText('Цена от'), { target: { value: '5000' } })
  fireEvent.change(screen.getByLabelText('Цена до'), { target: { value: '1000' } })
  await pickPoint()

  await userEvent.click(screen.getByRole('button', { name: 'Опубликовать' }))

  expect(
    await screen.findByText('Максимальная цена не может быть меньше минимальной'),
  ).toBeInTheDocument()
  expect(posted).toBe(0)
})

test('edit mode prefills the order and disables fields when it is not open', async () => {
  server.use(
    http.get('/api/v1/orders/1', () =>
      HttpResponse.json({
        ...order,
        status: 'assigned',
        photos: ['/media/old.jpg'],
      }),
    ),
  )

  renderEdit(1)

  expect(await screen.findByLabelText('Название')).toHaveValue(order.title)
  expect(screen.getByRole('img', { name: 'Фотография 1' })).toHaveAttribute(
    'src',
    '/media/old.jpg',
  )
  expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled()
  expect(screen.getByText(/Редактирование недоступно/)).toBeInTheDocument()
})
