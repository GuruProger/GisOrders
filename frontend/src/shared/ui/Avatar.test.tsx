import { render, screen } from '@testing-library/react'
import { Avatar } from './Avatar'

test('shows initials for a full name', () => {
  render(<Avatar name="Анна Петрова" />)
  expect(screen.getByText('АП')).toBeInTheDocument()
})

test('falls back to a neutral placeholder for an empty name', () => {
  render(<Avatar name="   " />)
  expect(screen.getByText('?')).toBeInTheDocument()
})
