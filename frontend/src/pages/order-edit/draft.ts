import { STORAGE_KEYS, getJson, removeItem, setJson } from '@/shared/lib/storage'
import { EMPTY_FORM, type OrderFormValues } from './schema'

/**
 * Unsaved order form state persisted to `localStorage` so an accidental close
 * does not lose the input. Photos are stored as uploaded URLs only — `File`
 * objects cannot be serialized.
 */
export interface OrderDraft extends OrderFormValues {
  point: { lat: number; lon: number } | null
  photos: string[]
}

let timer: ReturnType<typeof setTimeout> | null = null

/** Debounced write: bursts of keystrokes produce a single storage update. */
export function saveDraft(draft: OrderDraft): void {
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    setJson(STORAGE_KEYS.draft, draft)
  }, 500)
}

export function loadDraft(): OrderDraft | null {
  const draft = getJson<OrderDraft>(STORAGE_KEYS.draft)
  if (draft === null || typeof draft !== 'object') return null

  // Storage is user-editable: drop malformed point/photo values instead of
  // letting them reach the map or the photo list.
  const rawPoint = draft.point as unknown
  const point =
    rawPoint !== null &&
    typeof rawPoint === 'object' &&
    typeof (rawPoint as { lat?: unknown }).lat === 'number' &&
    typeof (rawPoint as { lon?: unknown }).lon === 'number' &&
    Number.isFinite((rawPoint as { lat: number }).lat) &&
    Number.isFinite((rawPoint as { lon: number }).lon)
      ? { lat: (rawPoint as { lat: number }).lat, lon: (rawPoint as { lon: number }).lon }
      : null

  const rawPhotos = draft.photos as unknown
  const photos = Array.isArray(rawPhotos)
    ? rawPhotos.filter((url): url is string => typeof url === 'string')
    : []

  return { ...draftToFormValues(draft), point, photos }
}

/**
 * Turns a stored draft into form values. Older drafts may miss fields, so
 * every value falls back to the empty form instead of `undefined`.
 */
export function draftToFormValues(draft: OrderDraft | null): OrderFormValues {
  if (draft === null) return EMPTY_FORM
  return {
    title: draft.title ?? '',
    description: draft.description ?? '',
    min_price: draft.min_price ?? '',
    max_price: draft.max_price ?? '',
    deadline: draft.deadline ?? '',
    address: draft.address ?? '',
    tree_type: draft.tree_type ?? '',
    tree_height: draft.tree_height ?? '',
    tree_diameter: draft.tree_diameter ?? '',
  }
}

/** Cancels a pending write and drops the stored draft. */
export function clearDraft(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  removeItem(STORAGE_KEYS.draft)
}
