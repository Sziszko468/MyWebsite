/**
 * The hidden racing experience: where it goes and how it is found. The destination is somebody else's
 * website, and this site never reads, scripts or frames it. After a short transition (the loading state) the
 * visitor gets a screen with OPEN NFSU2, which opens the site in a NEW tab, and a way back to the Lab.
 *
 * Why there is no frame: nfsu2.xyz forbids being framed. On 2026-11-01 and again on 2026-11-05 it answered
 * `x-frame-options: DENY` and a `content-security-policy` with `frame-ancestors 'none'` (and
 * `cross-origin-embedder-policy: require-corp`, `cross-origin-resource-policy: same-origin`). A frame could only
 * ever show the browser's "refused to connect" page, and this site's own policy (`frame-src 'none'`,
 * src/security/headers.ts) would refuse it first. The protections are respected, not worked around, and the
 * policy is not loosened for a frame that cannot work.
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

/** How long the transition plays before the choices appear, in milliseconds (a brief fade under reduced motion). */
export const TRANSITION_MS = 1250
export const TRANSITION_REDUCED_MS = 300
