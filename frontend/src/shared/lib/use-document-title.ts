import { useEffect } from 'react'

/**
 * Sets the browser tab title while the page is mounted and restores the
 * previous one on unmount, so route changes never leave a stale title.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title
    document.title = title
    return () => {
      document.title = previous
    }
  }, [title])
}
