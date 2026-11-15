/**
 * The addresses a deliverable may point at (PROMPT 27). A version carries two optional https addresses and nothing else that leaves this server: where the customer may go to
 * look at the work (`preview_url`), and a picture they can place comments on (`image_url`). The server NEVER fetches either (no proxy, no thumbnailing, no reachability check:
 * nothing here can be turned into a request to an address a stranger chose), never redirects to either, and never stores a file. An address is accepted only when:
 *
 *  - it is `https` (not `http`, `javascript:`, `data:`, `file:`, `blob:`, protocol-relative or relative),
 *  - it has no user name or password, no explicit port, no whitespace or control characters,
 *  - its host is a registered-looking name (letters, digits, hyphens, at least one dot): not `localhost`, not an IP address, not a `.local` / `.internal` name,
 *  - it is at most 2000 characters, and the stored form is what `new URL` makes of it (so no surprises reach a link).
 *
 * An address is EMBEDDED (a sandboxed frame, a picture in the page) only when its origin is on the owner's allowlist (`PREVIEW_ORIGINS`); any other address is a link the
 * customer opens in a new tab, with the host written out beside it. A picture to comment on must be on the allowlist (nothing else could be shown).
 */

export type UrlProblem = 'invalid' | 'not_https' | 'credentials' | 'port' | 'host' | 'too_long'

export interface ParsedUrl {
  /** What is stored: the address as `new URL` writes it. */
  url: string
  origin: string
  host: string
}

const MAX = 2000
const HOST = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/
const FORBIDDEN_SUFFIX = /\.(local|localhost|internal|intranet|lan|home|corp|onion)$/i

export function parsePreviewUrl(raw: string): { ok: true; value: ParsedUrl } | { ok: false; problem: UrlProblem } {
  const text = raw.trim()
  if (text.length > MAX) return { ok: false, problem: 'too_long' }
  // Whitespace, control characters and anything outside printable ASCII are refused before parsing: a parser's tolerance is not a rule.
  if (text.length === 0 || /[^\x21-\x7e]/.test(text)) return { ok: false, problem: 'invalid' }
  if (!/^https:\/\//i.test(text)) return { ok: false, problem: /^[a-z][a-z0-9+.-]*:/i.test(text) || text.startsWith('//') ? 'not_https' : 'invalid' }
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return { ok: false, problem: 'invalid' }
  }
  if (url.protocol !== 'https:') return { ok: false, problem: 'not_https' }
  if (url.username || url.password) return { ok: false, problem: 'credentials' }
  if (url.port) return { ok: false, problem: 'port' }
  const host = url.hostname.replace(/\.$/, '').toLowerCase()
  if (!HOST.test(host) || /^[0-9.]+$/.test(host) || FORBIDDEN_SUFFIX.test(host)) return { ok: false, problem: 'host' }
  const stored = url.href
  if (stored.length > MAX || /[^\x21-\x7e]/.test(stored)) return { ok: false, problem: 'too_long' }
  return { ok: true, value: { url: stored, origin: url.origin, host } }
}

/** Whether an address may be shown INSIDE the portal: its origin is exactly one of the owner's. */
export function isEmbeddable(url: string | null, allowed: readonly string[]): boolean {
  if (!url) return false
  try {
    return allowed.includes(new URL(url).origin)
  } catch {
    return false
  }
}

/** The host of an address, for the words beside a link ("opens example.com in a new tab"); `null` for anything that is not one. */
export function hostOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}
