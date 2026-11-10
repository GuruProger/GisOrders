import { z } from 'zod'

/** Accepts `2500` and `2500,50`; used by both the schema and the submit handler. */
export function parsePrice(raw: string): number {
  return Number(raw.trim().replace(',', '.'))
}

export const proposalSchema = z.object({
  price: z
    .string()
    .min(1, 'Укажите цену')
    .refine((raw) => Number.isFinite(parsePrice(raw)), 'Введите число')
    .refine((raw) => parsePrice(raw) > 0, 'Цена должна быть больше нуля'),
  message: z.string().max(1000, 'Сообщение не длиннее 1000 символов'),
})

export type ProposalFormValues = z.infer<typeof proposalSchema>
