/**
 * What an uploaded file really is. The browser's `Content-Type` and the file's name are the sender's claims; the first bytes
 * are the truth. Only four raster formats are accepted (PNG, JPEG, WebP, GIF), each read just far enough to learn its width and
 * height, so the page can reserve the space before the picture arrives. SVG is refused on purpose (it can carry script), as are
 * AVIF/HEIC (nothing in the project decodes them) and anything else. Nothing is decoded or re-encoded here: the server has no
 * image library (it has no dependencies at all); the administration shrinks large pictures in the browser before it uploads them.
 */

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

export interface ImageInfo {
  mime: ImageMime
  extension: 'png' | 'jpg' | 'webp' | 'gif'
  width: number
  height: number
}

/** Largest side and largest area accepted: a decompression bomb is a small file that is huge once decoded. */
export const MAX_SIDE = 8000
export const MAX_PIXELS = 36_000_000

const EXTENSIONS: Record<ImageMime, ImageInfo['extension']> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
export const MIME_BY_EXTENSION: Record<string, ImageMime> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

function png(b: Buffer): [number, number] | null {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.readUInt32BE(4) !== 0x0d0a1a0a) return null
  if (b.toString('latin1', 12, 16) !== 'IHDR') return null
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

function jpeg(b: Buffer): [number, number] | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let offset = 2
  while (offset + 9 < b.length) {
    if (b[offset] !== 0xff) return null
    let marker = b[offset + 1]
    while (marker === 0xff && offset + 2 < b.length) {
      offset += 1
      marker = b[offset + 1]
    }
    // A start-of-frame marker holds the size; C4 (huffman table), C8 (reserved) and CC (arithmetic conditioning) are not frames.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return [b.readUInt16BE(offset + 7), b.readUInt16BE(offset + 5)]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    const size = b.readUInt16BE(offset + 2)
    if (size < 2) return null
    offset += 2 + size
  }
  return null
}

function webp(b: Buffer): [number, number] | null {
  if (b.length < 30 || b.toString('latin1', 0, 4) !== 'RIFF' || b.toString('latin1', 8, 12) !== 'WEBP') return null
  const kind = b.toString('latin1', 12, 16)
  if (kind === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null
    return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
  }
  if (kind === 'VP8L') {
    if (b[20] !== 0x2f) return null
    const bits = b.readUInt32LE(21)
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1]
  }
  if (kind === 'VP8X') return [(b[24] | (b[25] << 8) | (b[26] << 16)) + 1, (b[27] | (b[28] << 8) | (b[29] << 16)) + 1]
  return null
}

function gif(b: Buffer): [number, number] | null {
  const head = b.toString('latin1', 0, 6)
  if (b.length < 10 || (head !== 'GIF87a' && head !== 'GIF89a')) return null
  return [b.readUInt16LE(6), b.readUInt16LE(8)]
}

/** The format and size of an image, or `null` for anything that is not one of the four, is truncated, or is absurdly large. */
export function sniffImage(buffer: Buffer): ImageInfo | null {
  const candidates: Array<[ImageMime, (b: Buffer) => [number, number] | null]> = [
    ['image/png', png],
    ['image/jpeg', jpeg],
    ['image/webp', webp],
    ['image/gif', gif],
  ]
  for (const [mime, read] of candidates) {
    let size: [number, number] | null = null
    try {
      size = read(buffer)
    } catch {
      size = null
    }
    if (!size) continue
    const [width, height] = size
    if (!(width > 0 && height > 0) || width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) return null
    return { mime, extension: EXTENSIONS[mime], width, height }
  }
  return null
}
