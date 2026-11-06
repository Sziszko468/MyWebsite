import { IMAGE_COMFORTABLE_BYTES, IMAGE_MAX_SIDE } from './projects'

/**
 * The server has no image library (it has no dependencies at all), so a picture is made smaller HERE, in the browser, before it
 * is uploaded: one that is wider than 1600 px, or heavier than 600 kB, is drawn on a canvas at the smaller size and sent as WebP;
 * one that is already small is sent as it is. A GIF is never re-encoded (the canvas would drop its animation). The server then
 * checks what arrives all over again: this is a courtesy to the website's visitors, not a safeguard.
 */

export interface PreparedImage {
  blob: Blob
  name: string
  before: number
  after: number
  resized: boolean
}

export function fitSize(width: number, height: number, max = IMAGE_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** Whether a picture of this size and kind is worth re-encoding. */
export function needsOptimizing(type: string, bytes: number, width: number, height: number): boolean {
  if (type === 'image/gif') return false
  return Math.max(width, height) > IMAGE_MAX_SIDE || bytes > IMAGE_COMFORTABLE_BYTES
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  const original: PreparedImage = { blob: file, name: file.name, before: file.size, after: file.size, resized: false }
  if (typeof createImageBitmap !== 'function' || !/^image\/(png|jpeg|webp)$/.test(file.type)) return original
  try {
    const bitmap = await createImageBitmap(file)
    if (!needsOptimizing(file.type, file.size, bitmap.width, bitmap.height)) {
      bitmap.close()
      return original
    }
    const size = fitSize(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, size.width, size.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.86))
    // Never make a picture bigger or lose it: keep the original when the re-encoded one is not smaller.
    if (!blob || blob.size >= file.size) return original
    return { blob, name: `${file.name.replace(/\.[^.]+$/, '')}.webp`, before: file.size, after: blob.size, resized: true }
  } catch {
    return original
  }
}
