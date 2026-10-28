type Rgb = readonly [number, number, number]

function parseHex(hex: string): Rgb {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  const raw = match?.[1]
  if (!raw) throw new Error(`Unsupported color format: ${hex}`)

  return [
    Number.parseInt(raw.slice(0, 2), 16),
    Number.parseInt(raw.slice(2, 4), 16),
    Number.parseInt(raw.slice(4, 6), 16),
  ]
}

function toHex(channels: Rgb): string {
  return `#${channels
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

function channelToLinear(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

/** WCAG 2.x relative luminance of an `#rrggbb` color. */
export function relativeLuminance(hex: string): number {
  const [red, green, blue] = parseHex(hex)
  return (
    0.2126 * channelToLinear(red) +
    0.7152 * channelToLinear(green) +
    0.0722 * channelToLinear(blue)
  )
}

/** WCAG 2.x contrast ratio (1–21) between two `#rrggbb` colors. */
export function contrastRatio(foreground: string, background: string): number {
  const first = relativeLuminance(foreground)
  const second = relativeLuminance(background)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Flattens a translucent foreground over an opaque background, approximating
 * CSS alpha compositing in sRGB. Used for Tailwind opacity modifiers such as
 * `bg-amber-500/15`.
 */
export function compositeOver(foreground: string, background: string, alpha: number): string {
  if (!Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new RangeError(`Alpha must be between 0 and 1, received ${alpha}`)
  }

  const [foregroundRed, foregroundGreen, foregroundBlue] = parseHex(foreground)
  const [backgroundRed, backgroundGreen, backgroundBlue] = parseHex(background)
  const mix = (foregroundChannel: number, backgroundChannel: number): number =>
    Math.round(foregroundChannel * alpha + backgroundChannel * (1 - alpha))

  return toHex([
    mix(foregroundRed, backgroundRed),
    mix(foregroundGreen, backgroundGreen),
    mix(foregroundBlue, backgroundBlue),
  ])
}
