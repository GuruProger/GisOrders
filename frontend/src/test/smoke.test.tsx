import { render, screen } from '@testing-library/react'
import { App } from '@/app/App'

afterEach(() => {
  localStorage.clear()
})

test('redirects to the login page when there is no session', async () => {
  render(<App />)

  expect(await screen.findByRole('heading', { name: 'Вход' })).toBeInTheDocument()
})
