import { useEffect, useRef, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui/Button'
import { compressImage } from './compress'
import { uploadImage } from '@/api/uploads'

const MAX_PHOTOS = 5
const MAX_SIZE_MB = 5
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024

interface PhotoItem {
  key: string
  file: File
  /** Object URL for the local preview; empty when the browser cannot make one. */
  preview: string
  status: 'uploading' | 'error'
}

export interface PhotoUploaderProps {
  /** Uploaded photo URLs, ordered; controlled by the page. */
  photos: string[]
  onChange(photos: string[]): void
  /** Number of photos still uploading, so the page can block publishing. */
  onUploadingChange?(count: number): void
  disabled?: boolean
}

function makePreview(file: File): string {
  try {
    return URL.createObjectURL(file)
  } catch {
    return ''
  }
}

function revokePreview(preview: string): void {
  if (preview === '') return
  try {
    URL.revokeObjectURL(preview)
  } catch {
    // Nothing to clean up in environments without object URLs.
  }
}

let nextKey = 0

/**
 * Photo picker with client-side validation, canvas compression, parallel
 * uploads and a per-photo retry. Successful photos are reported to the parent
 * as URLs; failed ones stay in the list until removed or retried.
 */
export function PhotoUploader({
  photos,
  onChange,
  onUploadingChange,
  disabled = false,
}: PhotoUploaderProps) {
  const [items, setItems] = useState<PhotoItem[]>([])
  const [rejection, setRejection] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  // Synchronous mirror of the parent value: two uploads can resolve before
  // React commits the first update, and reading a render snapshot would drop
  // one of them. Every change goes through `commitPhotos`.
  const photosRef = useRef(photos)
  photosRef.current = photos
  const itemsRef = useRef(items)
  itemsRef.current = items
  // Keys with an upload in flight, so a double-click on «Повторить» is a no-op.
  const inFlight = useRef(new Set<string>())
  // Items removed (or unmounted) mid-upload: their late success is ignored.
  const cancelled = useRef(new Set<string>())

  function commitPhotos(next: string[]): void {
    photosRef.current = next
    onChange(next)
  }

  function patchItem(key: string, patch: Partial<PhotoItem>): void {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  function upload(item: PhotoItem): void {
    if (inFlight.current.has(item.key)) return
    inFlight.current.add(item.key)
    patchItem(item.key, { status: 'uploading' })
    void compressImage(item.file)
      .then((file) => uploadImage(file))
      .then((url) => {
        if (cancelled.current.has(item.key)) {
          cancelled.current.delete(item.key)
          return
        }
        // The parent list renders the finished photo; drop the local item.
        setItems((current) => current.filter((entry) => entry.key !== item.key))
        revokePreview(item.preview)
        if (!photosRef.current.includes(url)) {
          commitPhotos([...photosRef.current, url])
        }
      })
      .catch(() => {
        cancelled.current.delete(item.key)
        patchItem(item.key, { status: 'error' })
      })
      .finally(() => {
        inFlight.current.delete(item.key)
      })
  }

  // Tell the page how many uploads are in flight so it can block publishing.
  const uploadingCount = items.filter((item) => item.status === 'uploading').length
  useEffect(() => {
    onUploadingChange?.(uploadingCount)
  }, [onUploadingChange, uploadingCount])
  useEffect(() => () => onUploadingChange?.(0), [onUploadingChange])

  // Revoke previews that are still around when the screen goes away, and
  // ignore uploads that resolve after unmount.
  useEffect(
    () => () => {
      for (const item of itemsRef.current) {
        revokePreview(item.preview)
        if (item.status === 'uploading') cancelled.current.add(item.key)
      }
    },
    [],
  )

  function addFiles(incoming: File[]): void {
    setRejection(null)

    const images = incoming.filter((file) => file.type.startsWith('image/'))
    if (images.length !== incoming.length) {
      setRejection('Можно загружать только изображения (JPEG, PNG, WebP)')
    }

    const oversized = images.filter((file) => file.size > MAX_SIZE_BYTES)
    if (oversized.length > 0) {
      setRejection(`Файл больше ${MAX_SIZE_MB} МБ — выберите файл поменьше`)
    }

    const accepted = images.filter((file) => file.size <= MAX_SIZE_BYTES)
    const freeSlots = MAX_PHOTOS - photos.length - items.length
    if (accepted.length > freeSlots) {
      setRejection(`Не больше ${MAX_PHOTOS} фотографий на заказ`)
    }

    const queued = accepted.slice(0, Math.max(0, freeSlots)).map((file) => ({
      key: `photo-${nextKey++}`,
      file,
      preview: makePreview(file),
      status: 'uploading' as const,
    }))

    if (queued.length === 0) return
    setItems((current) => [...current, ...queued])
    // Uploads run in parallel; each reports into the parent list on its own.
    for (const item of queued) upload(item)
  }

  function removeItem(item: PhotoItem): void {
    revokePreview(item.preview)
    if (item.status === 'uploading') cancelled.current.add(item.key)
    setItems((current) => current.filter((entry) => entry.key !== item.key))
  }

  function removePhoto(url: string): void {
    commitPhotos(photosRef.current.filter((entry) => entry !== url))
  }

  const uploadedCount = photos.length

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="order-photos"
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragOver(false)
          if (disabled) return
          addFiles(Array.from(event.dataTransfer.files))
        }}
        className={cn(
          'flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-sage-50 px-4 py-4 text-center text-sm text-muted-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500',
          dragOver && 'border-leaf-500 bg-sage-100',
          disabled && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className="font-medium text-forest-900">Добавьте фото дерева или участка</span>
        <span>Перетащите файлы сюда или нажмите, чтобы выбрать (до {MAX_PHOTOS} фото, до {MAX_SIZE_MB} МБ)</span>
      </label>
      <input
        id="order-photos"
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          addFiles(Array.from(event.target.files ?? []))
          event.target.value = ''
        }}
      />

      {rejection && (
        <p role="alert" className="text-sm text-terracotta-600">
          {rejection}
        </p>
      )}

      {(uploadedCount > 0 || items.length > 0) && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((url, index) => (
            <li key={url} className="relative">
              <img
                src={url}
                alt={`Фотография ${index + 1}`}
                className="h-28 w-full rounded-lg border border-line object-cover"
              />
              <button
                type="button"
                aria-label={`Удалить фотографию ${index + 1}`}
                onClick={() => removePhoto(url)}
                disabled={disabled}
                className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-forest-900 shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
              >
                ×
              </button>
            </li>
          ))}

          {items.map((item) => (
            <li key={item.key} className="relative">
              {item.preview === '' ? (
                <div
                  role="img"
                  aria-label={item.file.name}
                  className="flex h-28 w-full items-center justify-center rounded-lg border border-line bg-sage-100 text-xs text-muted-strong"
                >
                  {item.file.name}
                </div>
              ) : (
                <img
                  src={item.preview}
                  alt={item.file.name}
                  className={cn(
                    'h-28 w-full rounded-lg border border-line object-cover',
                    item.status === 'error' && 'border-terracotta-600',
                  )}
                />
              )}
              {item.status === 'uploading' && (
                <span className="absolute inset-x-1 bottom-1 rounded bg-white/90 px-2 py-0.5 text-center text-xs text-muted-strong">
                  Загрузка…
                </span>
              )}
              {item.status === 'error' && (
                <div className="absolute inset-x-1 bottom-1 flex items-center justify-between gap-1 rounded bg-white/90 px-2 py-0.5">
                  <span className="text-xs text-terracotta-600">Ошибка</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-9 px-2 py-0 text-xs"
                    onClick={() => upload(item)}
                  >
                    Повторить
                  </Button>
                </div>
              )}
              <button
                type="button"
                aria-label={`Убрать ${item.file.name}`}
                onClick={() => removeItem(item)}
                disabled={disabled}
                className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-forest-900 shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
