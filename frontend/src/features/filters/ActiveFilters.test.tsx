import { fireEvent, render, screen } from '@testing-library/react'
import { TestProviders } from '@/test/providers'
import { ActiveFilters } from './ActiveFilters'
import { DEFAULT_FILTERS } from './model'

test('removes a single filter and keeps the rest with the point', () => {
  const onChange = vi.fn()
  render(
    <ActiveFilters
      value={{
        ...DEFAULT_FILTERS,
        q: 'спил',
        radiusKm: 25,
        treeType: 'сосна',
        lat: 1,
        lon: 2,
      }}
      onChange={onChange}
    />,
    { wrapper: TestProviders },
  )

  fireEvent.click(screen.getByRole('button', { name: 'Убрать фильтр Порода' }))

  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({
      q: 'спил',
      radiusKm: 25,
      treeType: null,
      lat: 1,
      lon: 2,
    }),
  )
})

test('removing the last filter restores defaults but keeps the point', () => {
  const onChange = vi.fn()
  render(
    <ActiveFilters
      value={{ ...DEFAULT_FILTERS, radiusKm: 50, lat: 1, lon: 2 }}
      onChange={onChange}
    />,
    { wrapper: TestProviders },
  )

  fireEvent.click(screen.getByRole('button', { name: 'Убрать фильтр Радиус' }))

  expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_FILTERS, lat: 1, lon: 2 })
})
