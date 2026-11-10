import { apiRequest } from './client'

export interface UploadedImage {
  url: string
  width: number
  height: number
  size: number
  content_type: string
}

/**
 * Uploads one image and returns the URL the backend stored it under.
 *
 * The browser must set the multipart boundary itself, so `Content-Type` is
 * deliberately left unset: setting it by hand breaks the upload.
 */
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)

  const { data } = await apiRequest<UploadedImage>('/uploads/images', {
    method: 'POST',
    body: form,
  })

  return data.url
}
