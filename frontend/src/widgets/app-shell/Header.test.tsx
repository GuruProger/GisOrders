import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router'
import { setRoleMode } from '@/features/switch-role/model'
import { useSession } from '@/features/auth/session'
import { TestProviders } from '@/test/providers'
import { Header } from './Header'

function renderHeader() {
  return render(
    <TestProviders initialEntries={['/']}>
      <Header />
      <Routes>
        <Route path="/orders/new" element={<p>Форма нового заказа</p>} />
      </Routes>
    </TestProviders>,
  )
}

beforeEach(() => {
  localStorage.clear()
  setRoleMode('customer')
})

afterEach(() => {
  cleanup()
  useSession.getState().clear()
  localStorage.clear()
})

test('customer mode shows the create-order link and it navigates to the form', async () => {
  renderHeader()

  const createLink = screen.getByRole('link', { name: 'Создать заказ' })
  expect(createLink).toHaveAttribute('href', '/orders/new')

  await userEvent.click(createLink)

  expect(await screen.findByText('Форма нового заказа')).toBeInTheDocument()
})

test('executor mode does not show the create-order link', () => {
  setRoleMode('executor')

  renderHeader()

  expect(screen.queryByRole('link', { name: 'Создать заказ' })).not.toBeInTheDocument()
})
