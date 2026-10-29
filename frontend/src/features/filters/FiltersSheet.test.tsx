import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { TestProviders } from '@/test/providers'
import { DEFAULT_FILTERS } from './model'
import { FiltersSheet } from './FiltersSheet'

test('shows result count on apply button and returns new radius', async () => {
  const onApply = vi.fn()
  render(
    <FiltersSheet
      open
      value={{ ...DEFAULT_FILTERS, lat: 1, lon: 2 }}
      total={12}
      onApply={onApply}
      onClose={vi.fn()}
    />,
    { wrapper: TestProviders },
  )

  await userEvent.click(screen.getByRole('radio', { name: '25 км' }))
  await userEvent.click(screen.getByRole('button', { name: 'Показать 12' }))

  expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ radiusKm: 25 }))
})

test('reset returns defaults but keeps the point', async () => {
  const onApply = vi.fn()
  render(
    <FiltersSheet
      open
      value={{ ...DEFAULT_FILTERS, radiusKm: 50, lat: 1, lon: 2 }}
      total={3}
      onApply={onApply}
      onClose={vi.fn()}
    />,
    { wrapper: TestProviders },
  )

  await userEvent.click(screen.getByRole('button', { name: 'Сбросить' }))

  expect(onApply).toHaveBeenCalledWith(
    expect.objectContaining({ radiusKm: 10, lat: 1, lon: 2 }),
  )
})

test('closes on escape and returns focus to the trigger', async () => {
  const onClose = vi.fn()

  function Harness() {
    const [open, setOpen] = useState(false)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Открыть
        </button>
        <FiltersSheet
          open={open}
          value={{ ...DEFAULT_FILTERS, lat: 1, lon: 2 }}
          total={null}
          onApply={vi.fn()}
          onClose={() => {
            setOpen(false)
            onClose()
          }}
        />
      </>
    )
  }

  render(<Harness />, { wrapper: TestProviders })

  const trigger = screen.getByRole('button', { name: 'Открыть' })
  trigger.focus()
  await userEvent.click(trigger)

  expect(screen.getByRole('dialog', { name: 'Фильтры' })).toBeInTheDocument()

  await userEvent.keyboard('{Escape}')

  expect(onClose).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})
