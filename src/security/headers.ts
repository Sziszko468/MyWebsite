/**
 * The HTTP headers the site should be served with: a Content-Security-Policy that lets in only what
 * the site really loads, the usual hardening headers and the cache rules. The build writes them to
 * `dist/_headers` (the format Netlify and Cloudflare Pages read); any other host copies the same
 * values into its own configuration (README, "Serving the site"). Pure, so every rule is tested.
 */

export interface HeaderInput {
  /** `sha256-…` values (base64) of the inline <script> blocks of the page shell. */
  scriptHashes: readonly string[]
  /** `sha256-…` values (base64) of the inline <style> blocks of the page shell. */
  styleHashes: readonly string[]
  /** Origins the page may send requests to besides itself: the form handlers and the analytics collector. */
  connectOrigins: readonly string[]
}

const quote = (hash: string) => `'sha256-${hash}'`

export function buildCsp({ scriptHashes, styleHashes, connectOrigins }: HeaderInput): string {
  const directives: [string, readonly string[]][] = [
    ['default-src', ["'self'"]],
    // Scripts: the site's own bundles and the one inline script that sets the theme before first paint.
    ['script-src', ["'self'", ...scriptHashes.map(quote)]],
    // Style attributes are set by the page's code (a measured size, a custom property); style elements must be hashed.
    ['style-src', ["'self'", ...styleHashes.map(quote)]],
    ['style-src-attr', ["'unsafe-inline'"]],
    // data: and blob: are the Lab's saved images and thumbnails.
    ['img-src', ["'self'", 'data:', 'blob:']],
    ['font-src', ["'self'"]],
    ['connect-src', ["'self'", ...connectOrigins]],
    ['worker-src', ["'self'", 'blob:']],
    ['object-src', ["'none'"]],
    ['frame-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
    ['upgrade-insecure-requests', []],
  ]
  return directives.map(([name, values]) => [name, ...values].join(' ')).join('; ')
}

/** Browser features the site never uses are switched off, so a script that slipped in could not use them either. */
export const PERMISSIONS_POLICY = [
  'accelerometer',
  'autoplay',
  'bluetooth',
  'camera',
  'display-capture',
  'geolocation',
  'gyroscope',
  'hid',
  'magnetometer',
  'microphone',
  'midi',
  'payment',
  'serial',
  'usb',
]
  .map((feature) => `${feature}=()`)
  .join(', ')

export const IMMUTABLE = 'public, max-age=31536000, immutable'

export function buildHeadersFile(input: HeaderInput): string {
  const block = (pattern: string, headers: Record<string, string>) =>
    [pattern, ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`)].join('\n')
  return `${[
    '# Written by the build (scripts/prerender.mjs from src/security/headers.ts). Do not edit.',
    block('/*', {
      'Content-Security-Policy': buildCsp(input),
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': PERMISSIONS_POLICY,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Strict-Transport-Security': 'max-age=31536000',
    }),
    // Built files carry a hash of their content in their name, so they never change under that name.
    block('/assets/*', { 'Cache-Control': IMMUTABLE }),
    // Pictures and the shared image keep their names, so they are revalidated after a day.
    block('/projects/*', { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' }),
    block('/og/*', { 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' }),
    block('/sitemap.xml', { 'Cache-Control': 'public, max-age=3600' }),
    block('/robots.txt', { 'Cache-Control': 'public, max-age=3600' }),
  ].join('\n\n')}\n`
}

/** The origin of an address, or `null` for anything that is not a usable one. */
export function originOf(address: string | null | undefined): string | null {
  if (!address) return null
  try {
    return new URL(address).origin
  } catch {
    return null
  }
}
