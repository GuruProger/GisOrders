import type { FieldErrors, FieldValues, Resolver } from 'react-hook-form'
import type { ZodType } from 'zod'

/**
 * Minimal bridge between zod and react-hook-form. It maps the first zod issue
 * of every field onto react-hook-form errors, which is all the forms in this
 * app need and keeps `@hookform/resolvers` out of the bundle.
 */
export function zodResolver<TValues extends FieldValues>(
  schema: ZodType<TValues>,
): Resolver<TValues> {
  return (values) => {
    const result = schema.safeParse(values)
    if (result.success) return { values: result.data, errors: {} }

    const errors: Record<string, { type: 'validation'; message: string }> = {}
    for (const issue of result.error.issues) {
      const key = issue.path.map(String).join('.')
      if (key && !(key in errors)) {
        errors[key] = { type: 'validation', message: issue.message }
      }
    }

    return { values: {}, errors: errors as FieldErrors<TValues> }
  }
}
