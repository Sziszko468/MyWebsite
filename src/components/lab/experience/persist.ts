/**
 * Saving and loading for the experiences. Everything stays in the visitor's own browser: there is
 * no server, so there is no cloud save, and nothing here pretends to be one. A save is JSON in
 * `localStorage`; an export is a file the visitor downloads; an import is a file the visitor picks.
 *
 * Anything that comes back in is untrusted: a file can be anything, and `localStorage` can hold what
 * an older version or another page wrote. So every read goes through a `parse` that must accept
 * only what it understands and refuse the rest, and every size is capped before it is parsed.
 */

/** The largest JSON text a save, a load or an import may be, in characters. */
export const MAX_JSON_CHARS = 2_000_000

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Reads a saved value, or null if there is none, it is too large, it is not JSON or `parse` does not accept it. */
export function loadJson<T>(key: string, parse: (raw: unknown) => T | null): T | null {
  try {
    const text = storage()?.getItem(key)
    if (!text || text.length > MAX_JSON_CHARS) return null
    return parse(JSON.parse(text))
  } catch {
    return null
  }
}

export type SaveResult = { ok: true } | { ok: false; reason: 'too-large' | 'blocked' }

/** Saves a value as JSON. It says why it could not (a full or blocked store) instead of failing silently. */
export function saveJson(key: string, value: unknown, maxChars = MAX_JSON_CHARS): SaveResult {
  try {
    const text = JSON.stringify(value)
    if (text.length > maxChars) return { ok: false, reason: 'too-large' }
    const store = storage()
    if (!store) return { ok: false, reason: 'blocked' }
    store.setItem(key, text)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'blocked' }
  }
}

export function removeKey(key: string): void {
  try {
    storage()?.removeItem(key)
  } catch {
    // Nothing to remove.
  }
}

/** Offers a blob to the visitor as a download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // The browser has taken the file by the time the click returns; the address can go.
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function downloadJson(value: unknown, filename: string): void {
  downloadBlob(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }), filename)
}

/** Reads a picked file as text, refusing one larger than `maxBytes` before reading it. */
export async function readFileText(file: File, maxBytes: number): Promise<string> {
  if (file.size > maxBytes) throw new Error('too-large')
  return file.text()
}

/** A filename that is safe on every system: letters, digits, dashes. */
export function safeFilename(name: string, extension: string): string {
  const base =
    name
      .normalize('NFKD')
      .replace(/[^\w\- ]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 40)
      .toLowerCase() || 'lab'
  return `${base}.${extension}`
}
