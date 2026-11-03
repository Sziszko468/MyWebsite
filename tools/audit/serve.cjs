// Static server for dist/ that behaves like a plain static host with compression:
//  - serves a file, or <dir>/index.html
//  - applies dist/_headers (Netlify / Cloudflare Pages format) when present and --headers is given
//  - unknown path: --fallback=spa -> index.html with 200 (old behaviour), --fallback=404 -> 404.html with status 404
//  - brotli/gzip, cached in memory, so transfer sizes are realistic
const http = require('http')
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
}
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.xml', '.txt', '.svg', '.webmanifest'])

function parseHeaders(text) {
  const rules = []
  let current = null
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    if (!/^\s/.test(raw)) { current = { pattern: raw.trim(), headers: {} }; rules.push(current); continue }
    const i = raw.indexOf(':')
    if (current && i > 0) current.headers[raw.slice(0, i).trim()] = raw.slice(i + 1).trim()
  }
  return rules
}
function matches(pattern, url) {
  const re = new RegExp('^' + pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$')
  return re.test(url)
}

function start({ dir, port = 4173, fallback = 'spa', headers = false, quiet = true, log = null }) {
  const cache = new Map()
  const rules = headers && fs.existsSync(path.join(dir, '_headers')) ? parseHeaders(fs.readFileSync(path.join(dir, '_headers'), 'utf8')) : []
  const server = http.createServer((req, res) => {
   try {
    const url = new URL(req.url, 'http://x')
    let pathname = decodeURIComponent(url.pathname)
    if (log) log(req.method, url.pathname + url.search)
    let file = path.join(dir, pathname)
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return }
    let status = 200
    let stat = fs.existsSync(file) ? fs.statSync(file) : null
    if (stat && stat.isDirectory()) {
      if (!pathname.endsWith('/')) { res.writeHead(301, { Location: pathname + '/' + url.search }).end(); return }
      file = path.join(file, 'index.html'); stat = fs.existsSync(file) ? fs.statSync(file) : null
    }
    if (!stat) {
      if (fallback === 'spa') { file = path.join(dir, 'index.html') }
      else { file = path.join(dir, '404.html'); status = 404 }
      stat = fs.existsSync(file) ? fs.statSync(file) : null
      if (!stat) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found'); return }
    }
    const ext = path.extname(file)
    const h = { 'Content-Type': TYPES[ext] || 'application/octet-stream' }
    if (pathname.startsWith('/assets/')) h['Cache-Control'] = 'public, max-age=31536000, immutable'
    else h['Cache-Control'] = 'no-cache'
    for (const rule of rules) if (matches(rule.pattern, url.pathname)) Object.assign(h, rule.headers)
    const key = file + ':' + stat.mtimeMs
    let entry = cache.get(key)
    if (!entry) { entry = { raw: fs.readFileSync(file) }; cache.set(key, entry) }
    const accept = String(req.headers['accept-encoding'] || '')
    let body = entry.raw
    if (COMPRESSIBLE.has(ext) && body.length > 256) {
      if (/\bbr\b/.test(accept)) { entry.br ??= zlib.brotliCompressSync(entry.raw); body = entry.br; h['Content-Encoding'] = 'br' }
      else if (/\bgzip\b/.test(accept)) { entry.gz ??= zlib.gzipSync(entry.raw); body = entry.gz; h['Content-Encoding'] = 'gzip' }
      h['Vary'] = 'Accept-Encoding'
    }
    h['Content-Length'] = body.length
    res.writeHead(status, h)
    req.method === 'HEAD' ? res.end() : res.end(body)
   } catch (e) { try { res.writeHead(500).end(String(e.message)) } catch {} }
  })
  server.on('clientError', (e, socket) => { try { socket.destroy() } catch {} })
  server.on('error', () => {})
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(r)) })))
}

module.exports = { start, parseHeaders }

if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')))
  start({ dir: path.resolve(args.dir || 'dist'), port: Number(args.port || 4173), fallback: args.fallback || 'spa', headers: args.headers === '1' }).then((s) => console.log('serving', s.url))
}
