import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compositeOver, contrastRatio } from './contrast'

const AA_SMALL_TEXT = 4.5
const AMBER_TINT_ALPHA = 0.15

// Read the real design tokens so this test fails if styles.css drifts.
const styles = readFileSync(resolve(process.cwd(), 'src/app/styles.css'), 'utf8')

function token(name: string): string {
  const pattern = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`)
  const value = pattern.exec(styles)?.[1]
  if (!value) throw new Error(`Missing or unsupported --color-${name} in styles.css`)
  return value
}

const colors = {
  amber500: token('amber-500'),
  amber700: token('amber-700'),
  card: token('card'),
  line: token('line'),
  moss600: token('moss-600'),
  mutedStrong: token('muted-strong'),
  sage100: token('sage-100'),
  surface: token('surface'),
  terracotta50: token('terracotta-50'),
  terracotta600: token('terracotta-600'),
  white: '#ffffff',
}

const pairs = [
  {
    label: 'open badge: moss-600 on sage-100',
    foreground: colors.moss600,
    background: colors.sage100,
  },
  {
    label: 'work badge: amber-700 on amber-500/15 over card',
    foreground: colors.amber700,
    background: compositeOver(colors.amber500, colors.card, AMBER_TINT_ALPHA),
  },
  {
    label: 'work badge: amber-700 on amber-500/15 over surface',
    foreground: colors.amber700,
    background: compositeOver(colors.amber500, colors.surface, AMBER_TINT_ALPHA),
  },
  {
    label: 'closed badge: muted-strong on line',
    foreground: colors.mutedStrong,
    background: colors.line,
  },
  {
    label: 'accepted badge: white on moss-600',
    foreground: colors.white,
    background: colors.moss600,
  },
  {
    label: 'rejected badge: terracotta-600 on terracotta-50',
    foreground: colors.terracotta600,
    background: colors.terracotta50,
  },
]

for (const { label, foreground, background } of pairs) {
  test(`${label} meets WCAG AA`, () => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(AA_SMALL_TEXT)
  })
}

test('secondary text meets WCAG AA on page and card surfaces', () => {
  expect(contrastRatio(colors.mutedStrong, colors.surface)).toBeGreaterThanOrEqual(AA_SMALL_TEXT)
  expect(contrastRatio(colors.mutedStrong, colors.card)).toBeGreaterThanOrEqual(AA_SMALL_TEXT)
})

test('contrast helper follows the WCAG reference values', () => {
  expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
  expect(contrastRatio('#ffffff', '#ffffff')).toBe(1)
})

test('composite helper blends translucent colors over an opaque background', () => {
  expect(compositeOver('#000000', '#ffffff', 0.5)).toBe('#808080')
  expect(compositeOver('#ffffff', '#ffffff', 0.15)).toBe('#ffffff')
  expect(() => compositeOver('#000000', '#ffffff', 1.5)).toThrow(RangeError)
})
