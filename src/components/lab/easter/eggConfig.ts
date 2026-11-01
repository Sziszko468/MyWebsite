/**
 * The hidden racing experience: where it goes and how it is found. The destination is somebody else's
 * website: after a short transition the visitor is taken there, in the same tab, and this site never reads,
 * scripts or frames it. (nfsu2.xyz forbids being framed anyway: on 2026-11-01 it answered
 * `x-frame-options: DENY` and a `content-security-policy` with `frame-ancestors 'none'`.)
 */
export const NFSU2 = {
  url: 'https://nfsu2.xyz/',
  host: 'nfsu2.xyz',
} as const

/** The keys that open it from the keyboard, for visitors who cannot or do not click the red dot. */
export const SECRET_KEYS = ['n', 'f', 's', 'u', '2'] as const

/** One step of matching a typed sequence: the new progress after a key. A wrong key starts over (and may itself start the sequence). */
export function advanceSequence(progress: number, key: string, sequence: readonly string[] = SECRET_KEYS): number {
  const lower = key.toLowerCase()
  if (lower === sequence[progress]) return progress + 1 === sequence.length ? sequence.length : progress + 1
  return lower === sequence[0] ? 1 : 0
}

/** Keys typed into a field, or with a shortcut modifier, are never part of the sequence. */
export function ignoresKey(event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return true
  const target = event.target as HTMLElement | null
  if (!target || typeof target.tagName !== 'string') return false
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable === true
}

/** How long the transition plays before the visitor is taken away, in milliseconds (a brief fade under reduced motion). */
export const TRANSITION_MS = 1250
export const TRANSITION_REDUCED_MS = 300

/**
 * Takes the whole tab to the destination. It goes through a link that is clicked, with `noreferrer`, so the
 * destination is not told which page the visitor came from; Back brings them back here.
 */
export function leaveFor(url: string, doc: Pick<Document, 'createElement' | 'body'> = document): void {
  const link = doc.createElement('a')
  link.href = url
  link.rel = 'noreferrer noopener'
  link.style.display = 'none'
  doc.body.appendChild(link)
  link.click()
  link.remove()
}
