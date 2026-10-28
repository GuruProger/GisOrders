import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'

test('primary button calls onClick', async () => {
  const onClick = vi.fn()
  render(<Button onClick={onClick}>Откликнуться</Button>)
  await userEvent.click(screen.getByRole('button', { name: 'Откликнуться' }))
  expect(onClick).toHaveBeenCalledTimes(1)
})

test('loading button is disabled and busy', () => {
  render(<Button loading>Отправка</Button>)
  const button = screen.getByRole('button', { name: /Отправка/ })
  expect(button).toBeDisabled()
  expect(button).toHaveAttribute('aria-busy', 'true')
})

test('danger variant is reachable by name', () => {
  render(<Button variant="danger">Закрыть заказ</Button>)
  expect(screen.getByRole('button', { name: 'Закрыть заказ' })).toBeInTheDocument()
})
