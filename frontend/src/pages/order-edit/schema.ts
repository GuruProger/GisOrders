import { z } from 'zod'
import type { OrderInput } from '@/api/orders'

/** Accepts `2500` and `2500,50`; shared by the schema and the submit handler. */
export function parseNumber(raw: string): number {
  const normalized = raw.trim().replace(',', '.')
  // Reject exponent/hex forms that `Number` would silently accept.
  return /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(normalized) ? Number(normalized) : Number.NaN
}

/** `""` or whitespace means "no value" for the optional price bounds. */
function parseOptionalPrice(raw: string): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  return parseNumber(trimmed)
}

export const orderSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(5, 'Название должно быть не короче 5 символов')
      .max(200, 'Название не длиннее 200 символов'),
    description: z
      .string()
      .trim()
      .min(10, 'Описание должно быть не короче 10 символов'),
    min_price: z
      .string()
      .refine((raw) => {
        const value = parseOptionalPrice(raw)
        return value === null || Number.isFinite(value)
      }, 'Введите число')
      .refine((raw) => {
        const value = parseOptionalPrice(raw)
        return value === null || value >= 0
      }, 'Цена не может быть отрицательной'),
    max_price: z
      .string()
      .refine((raw) => {
        const value = parseOptionalPrice(raw)
        return value === null || Number.isFinite(value)
      }, 'Введите число')
      .refine((raw) => {
        const value = parseOptionalPrice(raw)
        return value === null || value >= 0
      }, 'Цена не может быть отрицательной'),
    deadline: z
      .string()
      .min(1, 'Укажите срок')
      .refine((raw) => Number.isFinite(new Date(raw).getTime()), 'Укажите корректную дату')
      .refine((raw) => new Date(raw).getTime() > Date.now(), 'Срок должен быть в будущем'),
    address: z
      .string()
      .trim()
      .min(5, 'Адрес должен быть не короче 5 символов')
      .max(500, 'Адрес не длиннее 500 символов'),
    tree_type: z
      .string()
      .trim()
      .min(1, 'Укажите породу')
      .max(50, 'Порода не длиннее 50 символов'),
    tree_height: z
      .string()
      .min(1, 'Укажите высоту')
      .refine((raw) => Number.isFinite(parseNumber(raw)), 'Введите число')
      .refine((raw) => parseNumber(raw) > 0, 'Высота должна быть больше нуля'),
    tree_diameter: z
      .string()
      .min(1, 'Укажите диаметр')
      .refine((raw) => Number.isFinite(parseNumber(raw)), 'Введите число')
      .refine((raw) => parseNumber(raw) > 0, 'Диаметр должен быть больше нуля'),
  })
  .refine(
    (values) => {
      const min = parseOptionalPrice(values.min_price)
      const max = parseOptionalPrice(values.max_price)
      return min === null || max === null || max >= min
    },
    { message: 'Максимальная цена не может быть меньше минимальной', path: ['max_price'] },
  )

export type OrderFormValues = z.infer<typeof orderSchema>

/** Maps validated form strings onto the API payload (prices become `null`). */
export function toOrderInput(values: OrderFormValues, point: { lat: number; lon: number }): OrderInput {
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    min_price: parseOptionalPrice(values.min_price),
    max_price: parseOptionalPrice(values.max_price),
    deadline: new Date(values.deadline).toISOString(),
    address: values.address.trim(),
    tree_type: values.tree_type.trim(),
    tree_height: parseNumber(values.tree_height),
    tree_diameter: parseNumber(values.tree_diameter),
    photos: [],
    lat: point.lat,
    lon: point.lon,
  }
}

export const EMPTY_FORM: OrderFormValues = {
  title: '',
  description: '',
  min_price: '',
  max_price: '',
  deadline: '',
  address: '',
  tree_type: '',
  tree_height: '',
  tree_diameter: '',
}
