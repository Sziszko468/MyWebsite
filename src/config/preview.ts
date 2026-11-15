/**
 * The origins a deliverable's preview may be shown from INSIDE the client portal (PROMPT 27): a sandboxed frame, a picture the customer comments on. `VITE_PREVIEW_ORIGINS`, at
 * build time, is a comma-separated list of exact https origins (`https://previews.example.com`): no wildcard, no path, no user name, no port-less guess. The same list must be given
 * to the backend as `PREVIEW_ORIGINS`: the backend decides which address is embedded, this list lets the browser do it (the site's Content-Security-Policy has `frame-src 'none'`
 * everywhere else). An empty list changes nothing: every preview is a link the customer opens in a new tab.
 */

export interface PreviewOrigins {
  origins: string[]
  /** What was given but is not an acceptable origin (shown as a build warning; it is never used). */
  rejected: string[]
}

/** The exact https origin of an address, or `null` (a wildcard, another scheme, credentials, a path, a query or a fragment all make it unusable). */
export function exactHttpsOrigin(value: string): string | null {
  const text = value.trim()
  if (!text || text.includes('*')) return null
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
    // An ordinary public host name (the backend's rule for a preview address, server/src/modules/deliverables/preview.ts): not a number, not a name that only exists inside a network.
    const host = url.hostname
    if (!/^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/.test(host) || /^[0-9.]+$/.test(host) || /\.(local|localhost|internal|intranet|lan|home|corp|onion)$/i.test(host)) return null
    return url.origin
  } catch {
    return null
  }
}

export function parsePreviewOrigins(raw: unknown): PreviewOrigins {
  const result: PreviewOrigins = { origins: [], rejected: [] }
  if (typeof raw !== 'string') return result
  for (const item of raw.split(',').map((entry) => entry.trim()).filter(Boolean)) {
    const origin = exactHttpsOrigin(item)
    if (!origin) result.rejected.push(item)
    else if (!result.origins.includes(origin)) result.origins.push(origin)
  }
  return result
}

export const previewConfig: PreviewOrigins = parsePreviewOrigins(import.meta.env.VITE_PREVIEW_ORIGINS)
