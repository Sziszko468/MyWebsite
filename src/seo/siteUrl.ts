/**
 * The address the site is published at, as search engines and social networks must see it. It decides
 * whether the pages can be indexed at all (see `buildHead`): canonical addresses, language alternates,
 * the sitemap and structured data all need an absolute address, and none is guessed.
 */

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/

/**
 * Reduces a configured value to an origin (`https://example.com`) or `null`. Accepted: an https
 * address, or a local http address (so a test server can stand in). A path, query or hash is dropped,
 * because the site is published at the root of its host; credentials, other protocols and anything
 * that does not parse mean "not configured".
 */
export function normalizeSiteUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (url.username || url.password) return null
  const secure = url.protocol === 'https:'
  const local = url.protocol === 'http:' && LOCAL_HOST.test(url.hostname)
  if (!secure && !local) return null
  return url.origin
}

/** An absolute address for a root-relative path, or `null` while the site address is not configured. */
export function absoluteUrl(siteUrl: string | null, path: string): string | null {
  return siteUrl ? `${siteUrl}${path.startsWith('/') ? path : `/${path}`}` : null
}
