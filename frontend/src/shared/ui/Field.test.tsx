import { render, screen } from '@testing-library/react'
import { Field } from './Field'
import { Input } from './Input'

test('label is linked to input and error is announced', () => {
  render(
    <Field label="Название" htmlFor="title" error="Минимум 5 символов">
      <Input id="title" />
    </Field>,
  )
  expect(screen.getByLabelText('Название')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('Минимум 5 символов')
  expect(screen.getByLabelText('Название')).toHaveAttribute('aria-invalid', 'true')
})
