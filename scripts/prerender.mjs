// Runs after `vite build` (and after the SSR build of src/seo/entry.ts): writes each page's own HTML,
// sitemap.xml, robots.txt and _headers into dist/. See src/seo/entry.ts for what and why.
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const entry = join(root, 'node_modules', '.cache', 'seo', 'entry.js')

const template = await readFile(join(dist, 'index.html'), 'utf8')
const { buildSiteFiles } = await import(pathToFileURL(entry).href)

// The Content-Security-Policy allows the shell's inline <script> and <style> blocks by their hash. A browser hashes the
// text it parsed, and the HTML parser turns every CRLF (and lone CR) into LF first, so the hash is taken over the same
// text. Without this, a checkout with Windows line endings (git's autocrlf) hashed `\r\n` and the browser refused its own
// pre-paint theme script ("Executing inline script violates the following Content Security Policy directive").
const hashesOf = (tag) =>
  [...template.matchAll(new RegExp(String.raw`<${tag}(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</${tag}>`, 'g'))]
    .map((match) => match[1].replace(/\r\n?/g, '\n'))
    .filter((body) => body.trim() !== '')
    .map((body) => createHash('sha256').update(body).digest('base64'))

const { files, warnings } = buildSiteFiles(template, { scriptHashes: hashesOf('script'), styleHashes: hashesOf('style') })

for (const [path, content] of Object.entries(files)) {
  const target = join(dist, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content)
}

const pages = Object.keys(files).filter((path) => path.endsWith('index.html')).length
console.log(`seo: wrote ${pages} pages, 404.html, robots.txt${files['sitemap.xml'] ? ', sitemap.xml' : ''} and _headers`)
for (const warning of warnings) console.warn(`seo: WARNING ${warning}`)
