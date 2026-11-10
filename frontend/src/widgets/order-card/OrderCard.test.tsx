import { render, screen } from '@testing-library/react'
import { OrderCard } from './OrderCard'

const baseOrder = {
  id: 1,
  title: 'Спилить сухое дерево',
  description: 'Дерево во дворе',
  min_price: 2000,
  max_price: 3000,
  deadline: '2026-12-01T10:00:00Z',
  address: 'Москва',
  tree_type: 'сосна',
  tree_height: 12,
  tree_diameter: 35,
  photos: null,
  status: 'open' as const,
  created_at: '2026-10-01T10:00:00Z',
  closed_at: null,
  customer_id: 2,
  accepted_proposal_id: null,
  lat: 55.7658,
  lon: 37.6173,
  proposals_count: 3,
}

test('shows distance, price and proposals count', () => {
  render(<OrderCard order={baseOrder} userPoint={{ lat: 55.7558, lon: 37.6173 }} />)
  expect(screen.getByText('Спилить сухое дерево')).toBeInTheDocument()
  expect(screen.getByText('1,1 км')).toBeInTheDocument()
  expect(screen.getByText('3 отклика')).toBeInTheDocument()
  // Testing Library's default normalizer collapses \s (incl. U+00A0) to a plain
  // space, so opt out of normalization to assert the real non-breaking spaces.
  expect(
    screen.getByText(/3\u00A0000\u00A0₽/, { normalizer: (text) => text }),
  ).toBeInTheDocument()
})

test('zero proposals are shown as new order', () => {
  render(<OrderCard order={{ ...baseOrder, proposals_count: 0 }} userPoint={{ lat: 55.7558, lon: 37.6173 }} />)
  expect(screen.getByText('новый')).toBeInTheDocument()
})

test('missing photos do not break the card', () => {
  render(<OrderCard order={{ ...baseOrder, photos: ['/media/missing.jpg'] }} userPoint={{ lat: 55.7558, lon: 37.6173 }} />)
  expect(screen.getByRole('listitem')).toBeInTheDocument()
})
