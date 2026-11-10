import { render, screen } from '@testing-library/react'
import { UnreadBadge } from './UnreadBadge'

test('renders nothing when the count is zero', () => {
  const { container } = render(<UnreadBadge count={0} />)

  expect(container).toBeEmptyDOMElement()
})

test('renders the count with an accessible Russian name', () => {
  render(<UnreadBadge count={4} />)

  expect(screen.getByLabelText('4 непрочитанных')).toHaveTextContent('4')
})

test('uses the singular form for one unread message', () => {
  render(<UnreadBadge count={1} />)

  expect(screen.getByLabelText('1 непрочитанное')).toHaveTextContent('1')
})

test('caps large counts at 99+', () => {
  render(<UnreadBadge count={120} />)

  expect(screen.getByLabelText('120 непрочитанных')).toHaveTextContent('99+')
})
