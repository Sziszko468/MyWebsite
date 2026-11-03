/**
 * What happens to every piece of text a visitor sends before it is checked and stored. It never changes
 * the meaning of an honest message; it removes what has no use in one: control characters, invisible
 * direction overrides (which can make a link or a name read differently from what it is) and runs of
 * blank lines.
 */

// The point of this expression is to match control characters.
// oxlint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u2028\u2029]/g

export function cleanLine(value: string): string {
  return value.normalize('NFC').replace(CONTROL, ' ').replace(INVISIBLE, '').replace(/\s+/g, ' ').trim()
}

export function cleanBlock(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(INVISIBLE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Counts characters the way a person does (a letter with an accent, or an emoji, is one), which is what the limits mean. */
export const length = (value: string): number => [...value].length

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const URL_LIKE = /\b(?:https?:\/\/|www\.)\S+/gi
export const countLinks = (value: string): number => (value.match(URL_LIKE) ?? []).length
