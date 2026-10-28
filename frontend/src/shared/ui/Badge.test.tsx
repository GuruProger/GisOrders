import { render, screen } from '@testing-library/react'
import { Badge } from './Badge'

test('maps backend statuses to Russian labels', () => {
  const cases = [
    ['open', 'Открыт'],
    ['assigned', 'В работе'],
    ['closed', 'Закрыт'],
    ['accepted', 'Принят'],
    ['pending', 'Ожидает'],
    ['rejected', 'Отклонён'],
  ] as const

  for (const [status, label] of cases) {
    const { unmount } = render(<Badge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
    unmount()
  }
})
