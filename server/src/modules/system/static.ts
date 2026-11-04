import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve, sep } from 'node:path'
import type { Reply } from '../../http/reply.ts'

/**
 * Optional: serve the built website (`dist/`) from the same process (`STATIC_DIR`), so one small server is a
 * complete deployment and the website and the API share an origin (no CORS, no cross-site cookie questions). It
 * serves files and `dir/index.html`, redirects a directory to its slash form, answers anything else with the
 * build's own `404.html` and status 404, and applies the build's `_headers` file (the Content-Security-Policy
 * and cache rules `npm run build` wrote), so the site is served with exactly the policy it was tested under.
 * Compression is the reverse proxy's job. Only files of the kinds in `TYPES` are served, and nothing hidden, so
 * a `STATIC_DIR` pointed at the wrong folder still does not hand out a `.env` or a database.
 */

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
}

interface Rule {
  pattern: RegExp
  headers: Record<string, string>
}

function parseHeadersFile(text: string): Rule[] {
  const rules: Rule[] = []
  let current: Rule | null = null
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (!/^\s/.test(line)) {
      const source = line.trim().split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')
      current = { pattern: new RegExp(`^${source}$`), headers: {} }
      rules.push(current)
    } else if (current) {
      const index = line.indexOf(':')
      if (index > 0) current.headers[line.slice(0, index).trim()] = line.slice(index + 1).trim()
    }
  }
  return rules
}

export function serveStatic(directory: string, urlPath: string): Reply | null {
  const root = resolve(directory)
  let decoded: string
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  const segments = decoded.split('/')
  if (decoded.includes('\0') || segments.includes('..')) return null
  // The administration application's page is served only at /admin (with its own policy), never as a page of the website.
  if (decoded === '/admin.html') return null
  // A hidden file or folder (`.env`, `.git`) is never part of a website; `.well-known` is the one conventional exception.
  if (segments.some((segment, index) => segment.startsWith('.') && !(index === 1 && segment === '.well-known'))) return null
  let file = normalize(join(root, decoded))
  if (file !== root && !file.startsWith(root + sep)) return null

  const rules = existsSync(join(root, '_headers')) ? parseHeadersFile(readFileSync(join(root, '_headers'), 'utf8')) : []
  const headersFor = (path: string): Record<string, string> => Object.assign({}, ...rules.filter((rule) => rule.pattern.test(path)).map((rule) => rule.headers))

  let status = 200
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!decoded.endsWith('/')) return { status: 301, headers: { Location: `${decoded}/` }, body: '' }
    file = join(file, 'index.html')
  }
  // Only the kinds of file a website is made of are served: a database or a log pointed at by mistake is "not found".
  if (!existsSync(file) || !statSync(file).isFile() || !(extname(file).toLowerCase() in TYPES)) {
    const notFoundPage = join(root, '404.html')
    if (!existsSync(notFoundPage)) return null
    file = notFoundPage
    status = 404
  }
  const body = readFileSync(file)
  return {
    status,
    headers: { 'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', ...headersFor(decoded.endsWith('/') ? `${decoded}index.html` : decoded) },
    body,
  }
}

/**
 * The administration application. It is built with the website (`admin.html` and its script and style in `assets/`)
 * and served here at `/admin` and every address below it, so that it and the API it calls are one origin: the
 * session cookie is `SameSite=Strict` and the API sends no CORS headers, on purpose. Its own policy allows scripts
 * from this server only (no inline script, no eval, nothing from elsewhere), and the page is never cached or indexed.
 */
export const ADMIN_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'"

const ADMIN_HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': ADMIN_CSP, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }

export function serveAdminApp(directory: string | null): Reply {
  if (directory) {
    const file = join(resolve(directory), 'admin.html')
    if (existsSync(file) && statSync(file).isFile()) return { status: 200, headers: ADMIN_HEADERS, body: readFileSync(file) }
  }
  const body =
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Administration not installed</title></head>' +
    '<body><h1>The administration is not installed</h1>' +
    '<p>This server has no built website to take it from. Build the website (<code>npm run build</code>) and set <code>STATIC_DIR</code> to the <code>dist</code> folder, then reload this page.</p></body></html>'
  return { status: 404, headers: ADMIN_HEADERS, body }
}
