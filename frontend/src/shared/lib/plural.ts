/**
 * Russian plural form for `n`.
 * `11–14` always take the third form, `21` takes the first one.
 */
export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n)
  const mod100 = abs % 100
  const mod10 = abs % 10

  if (mod100 >= 11 && mod100 <= 14) return forms[2]
  if (mod10 === 1) return forms[0]
  if (mod10 >= 2 && mod10 <= 4) return forms[1]
  return forms[2]
}
