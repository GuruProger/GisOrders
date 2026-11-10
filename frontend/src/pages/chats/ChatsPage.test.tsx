import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router'
import type { Chat, User } from '@/api/types'
import { useSession } from '@/features/auth/session'
import { formatShortDate } from '@/shared/lib/format'
import { server } from '@/test/msw'
import { TestProviders } from '@/test/providers'
import { ChatsPage } from './ChatsPage'

const me = 2

const user: User = {
  id: me,
  email: 'customer@example.com',
  username: 'customer',
  phone_number: null,
  is_admin: false,
  is_active: true,
}

const older: Chat = {
  id: 1,
  order_id: 10,
  customer_id: me,
  executor_id: 3,
  proposal_id: null,
  is_active: true,
  created_at: '2026-09-01T10:00:00Z',
  updated_at: '2026-10-01T10:00:00Z',
  last_message: 'Старое сообщение',
  unread_count: 0,
}

const newer: Chat = {
  id: 2,
  order_id: 11,
  customer_id: me,
  executor_id: 4,
  proposal_id: 9,
  is_active: true,
  created_at: '2026-09-01T10:00:00Z',
  updated_at: new Date().toISOString(),
  last_message: 'Свежее сообщение',
  unread_count: 2,
}

const emptyChat: Chat = {
  ...older,
  id: 3,
  executor_id: 5,
  last_message: null,
  unread_count: 0,
}

function renderPage() {
  return render(
    <TestProviders initialEntries={['/chats']}>
      <Routes>
        <Route path="/chats" element={<ChatsPage />} />
        <Route path="/chats/:id" element={<p>Чат</p>} />
      </Routes>
    </TestProviders>,
  )
}

function serveChats(chats: Chat[]): void {
  server.use(http.get('/api/v1/chats/my', () => HttpResponse.json(chats)))
}

function serveUsers(): void {
  server.use(
    http.get('/api/v1/users/:id', ({ params }) => {
      const id = Number(params.id)
      return HttpResponse.json({ id, username: id === 3 ? 'Иван' : id === 4 ? 'Пётр' : 'Анна' })
    }),
  )
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))

beforeEach(() => {
  useSession.setState({ user, status: 'authenticated' })
  serveChats([older, newer, emptyChat])
  serveUsers()
})

afterEach(() => {
  cleanup()
  server.resetHandlers()
  useSession.getState().clear()
  localStorage.clear()
})

afterAll(() => server.close())

test('sorts chats by updated_at and links each row to its chat', async () => {
  renderPage()

  await screen.findByText('Пётр')

  const links = screen.getAllByRole('link')
  expect(links.map((link) => link.getAttribute('href'))).toEqual(['/chats/2', '/chats/1', '/chats/3'])

  expect(screen.getByText('Свежее сообщение')).toBeInTheDocument()
  expect(screen.getByText('Нет сообщений')).toBeInTheDocument()
  expect(screen.getByLabelText('2 непрочитанных')).toBeInTheDocument()
  expect(document.title).toBe('Чаты — GisOrders')
})

test('shows the opponent name, initials and the last message time', async () => {
  renderPage()

  expect(await screen.findByText('Иван')).toBeInTheDocument()
  expect(screen.getByText('Пётр')).toBeInTheDocument()
  expect(screen.getByText('Анна')).toBeInTheDocument()
  expect(screen.getByText('И')).toBeInTheDocument()
  expect(screen.getAllByText(formatShortDate(older.updated_at)).length).toBeGreaterThanOrEqual(1)
})

test('does not fetch names or guess the opponent when the own profile is unknown', async () => {
  useSession.setState({ user: null, status: 'authenticated' })
  let userRequests = 0
  server.use(
    http.get('/api/v1/users/:id', ({ params }) => {
      userRequests += 1
      return HttpResponse.json({ id: Number(params.id), username: 'Чужое имя' })
    }),
  )

  renderPage()

  expect(await screen.findAllByText('Собеседник')).toHaveLength(3)
  expect(userRequests).toBe(0)
  expect(screen.queryByText('Пользователь #2')).not.toBeInTheDocument()
})

test('falls back to a user id when the public profile is unavailable', async () => {
  server.use(http.get('/api/v1/users/:id', () => HttpResponse.json({}, { status: 500 })))

  renderPage()

  expect(await screen.findByText('Пользователь #4')).toBeInTheDocument()
})

test('an empty list shows the hint', async () => {
  serveChats([])

  renderPage()

  expect(await screen.findByText('Пока нет переписок')).toBeInTheDocument()
})

test('a failed load offers a retry', async () => {
  let requests = 0
  server.use(
    http.get('/api/v1/chats/my', () => {
      requests += 1
      return HttpResponse.json({ detail: 'Ошибка сервера' }, { status: 500 })
    }),
  )

  renderPage()

  expect(await screen.findByText('Не удалось загрузить чаты')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))

  await vi.waitFor(() => expect(requests).toBeGreaterThanOrEqual(2))
})
