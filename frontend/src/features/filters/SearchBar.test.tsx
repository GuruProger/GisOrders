import { act, fireEvent, render, screen } from '@testing-library/react'
import { SearchBar } from './SearchBar'

afterEach(() => {
  vi.useRealTimers()
})

test('debounces typing and calls onChange once after 350 ms', () => {
  vi.useFakeTimers()
  const onChange = vi.fn()
  render(<SearchBar value="" onChange={onChange} />)

  fireEvent.change(screen.getByLabelText('Поиск заказов'), {
    target: { value: 'спил' },
  })

  act(() => vi.advanceTimersByTime(349))
  expect(onChange).not.toHaveBeenCalled()

  act(() => vi.advanceTimersByTime(1))
  expect(onChange).toHaveBeenCalledTimes(1)
  expect(onChange).toHaveBeenCalledWith('спил')
})

test('adopts an externally changed value without re-emitting it', () => {
  const onChange = vi.fn()
  const { rerender } = render(<SearchBar value="сосна" onChange={onChange} />)

  const input = screen.getByLabelText('Поиск заказов')
  expect(input).toHaveValue('сосна')

  rerender(<SearchBar value="берёза" onChange={onChange} />)

  expect(input).toHaveValue('берёза')
  expect(onChange).not.toHaveBeenCalled()
})
