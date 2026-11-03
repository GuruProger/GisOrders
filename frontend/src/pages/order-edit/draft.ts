import { STORAGE_KEYS, getJson, removeItem, setJson } from '@/shared/lib/storage'
import type { OrderFormValues } from './schema'

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
  return getJson<OrderDraft>(STORAGE_KEYS.draft)
}

/** Cancels a pending write and drops the stored draft. */
export function clearDraft(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  removeItem(STORAGE_KEYS.draft)
}
