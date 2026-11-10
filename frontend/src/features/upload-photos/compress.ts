const MAX_SIDE = 1920
const JPEG_QUALITY = 0.85

/**
 * Downscales an image to 1920 px on the long side through a canvas and
 * re-encodes it as JPEG. Falls back to the original file when the canvas API
 * is unavailable (jsdom) or decoding fails — the backend resizes anyway.
 */
export async function compressImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context) return file

    canvas.width = width
    canvas.height = height
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    )
    if (!blob) return file

    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    })
  } catch {
    return file
  }
}
