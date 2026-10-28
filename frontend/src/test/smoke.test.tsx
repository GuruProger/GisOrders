import { render, screen } from '@testing-library/react'
import { App } from '@/app/App'

test('renders app title', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'GisOrders' })).toBeInTheDocument()
})
