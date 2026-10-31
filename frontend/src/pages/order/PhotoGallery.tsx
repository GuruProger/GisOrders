import { useState } from 'react'
import { cn } from '@/shared/lib/cn'

export interface PhotoGalleryProps {
  photos: string[] | null
  title: string
}

function PlaceholderIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-10"
      aria-hidden="true"
    >
      <path d="M4 17h16" />
      <path d="M12 4v4" />
      <path d="M12 8c-3 0-5 2-5 5h10c0-3-2-5-5-5Z" />
      <path d="M7 21h10" />
    </svg>
  )
}

/** Horizontal swipe gallery that silently drops images the browser cannot load. */
export function PhotoGallery({ photos, title }: PhotoGalleryProps) {
  const [failed, setFailed] = useState<string[]>([])

  const visible = (photos ?? []).filter((photo) => !failed.includes(photo))

  function markFailed(photo: string): void {
    setFailed((current) => (current.includes(photo) ? current : [...current, photo]))
  }

  if (visible.length === 0) {
    return (
      <div
        role="img"
        aria-label="Фотографии заказа отсутствуют"
        className="flex h-52 items-center justify-center rounded-xl bg-sage-100 text-muted-strong"
      >
        <PlaceholderIcon />
      </div>
    )
  }

  return (
    <div
      role="group"
      aria-label="Фотографии заказа"
      className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-xl"
    >
      {visible.map((photo, index) => (
        <img
          key={`${photo}-${index}`}
          src={photo}
          alt={`${title}, фото ${index + 1}`}
          onError={() => markFailed(photo)}
          className={cn(
            'h-52 w-full shrink-0 snap-center rounded-xl border border-line bg-sage-100 object-cover',
            'sm:w-80',
          )}
        />
      ))}
    </div>
  )
}
