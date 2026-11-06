// Fetches the backend's catalogue (GET /api/shop/catalog) into src/content/catalog.generated.json, which the website's
// content modules lay over their static text and prices at build time (src/content/catalogOverlay.ts), and the projects it has
// published (GET /api/projects) into src/content/projects.generated.json, which the build's prerender reads so that every
// published project with a page of its own gets its own title, description and sitemap entry (src/seo/entry.ts).
//
//   CATALOG_API_URL=https://api.example.com npm run catalog:pull        write the file
//   CATALOG_API_URL=https://api.example.com npm run catalog:pull -- --check   write nothing; exit 1 when the file is not the backend's current catalogue
//   npm run catalog:pull -- --remove                                    delete the file (build from the static content only)
//
// The address is CATALOG_API_URL, or VITE_API_URL when that is the backend's own origin (from the environment or from
// .env.production / .env.local / .env). `VITE_API_URL=/` (the backend serves the website) says nothing about where the
// backend is while building, so CATALOG_API_URL is needed then.
import { existsSync, readFileSync } from 'node:fs'
import { rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'src', 'content', 'catalog.generated.json')
const projectsTarget = join(root, 'src', 'content', 'projects.generated.json')
const args = new Set(process.argv.slice(2))

function fail(message, code = 1) {
  console.error(`catalog:pull: ${message}`)
  process.exit(code)
}

if (args.has('--remove')) {
  await rm(target, { force: true })
  await rm(projectsTarget, { force: true })
  console.log('catalog:pull: removed src/content/catalog.generated.json and projects.generated.json; the build uses the static content only.')
  process.exit(0)
}

/** KEY=value lines of a .env file (no expansion, no export): enough for one address. */
function readEnvFile(name) {
  const path = join(root, name)
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (match && !line.trim().startsWith('#')) out[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}
const fromFiles = { ...readEnvFile('.env'), ...readEnvFile('.env.local'), ...readEnvFile('.env.production') }
const setting = (name) => (process.env[name] ?? fromFiles[name] ?? '').trim()

const raw = setting('CATALOG_API_URL') || setting('VITE_API_URL')
if (!raw || raw === '/') fail('set CATALOG_API_URL to the backend origin, for example CATALOG_API_URL=https://api.example.com (VITE_API_URL=/ does not say where the backend is).', 2)
let base
try {
  base = new URL(raw)
} catch {
  fail(`"${raw}" is not an address.`, 2)
}
const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)
if (base.protocol !== 'https:' && !(base.protocol === 'http:' && local)) fail('the backend address must be https (http only for localhost).', 2)
if (base.username || base.password) fail('the address must not contain a user name or a password.', 2)

let response
try {
  response = await fetch(new URL('/api/shop/catalog', base.origin), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
} catch (error) {
  fail(`could not reach ${base.origin}: ${error instanceof Error ? error.message : error}`)
}
if (!response.ok) fail(`${base.origin} answered ${response.status} to /api/shop/catalog.`)
let payload
try {
  payload = await response.json()
} catch {
  fail('the answer is not JSON.')
}
const catalog = payload?.data
if (!catalog || typeof catalog !== 'object' || typeof catalog.version !== 'string') fail('the answer is not a catalogue (no data.version).')

/**
 * The projects the backend publishes. A backend without the portfolio (an older one) answers 404: then there is nothing to pull and
 * the build keeps the website's own four. Any other failure stops here, as for the catalogue: a build must not quietly use a list
 * that is not the backend's current one.
 */
async function pullProjects() {
  let answer
  try {
    answer = await fetch(new URL('/api/projects', base.origin), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20_000) })
  } catch (error) {
    fail(`could not read ${base.origin}/api/projects: ${error instanceof Error ? error.message : error}`)
  }
  if (answer.status === 404) return null
  if (!answer.ok) fail(`${base.origin} answered ${answer.status} to /api/projects.`)
  let body
  try {
    body = await answer.json()
  } catch {
    fail('the answer of /api/projects is not JSON.')
  }
  if (!Array.isArray(body?.data)) fail('the answer of /api/projects is not a list.')
  return { projects: body.data, categories: Array.isArray(body.meta?.categories) ? body.meta.categories : [] }
}
/** What makes two project lists the same: the addresses and when each was last changed. */
const projectsSignature = (list) => JSON.stringify((list ?? []).map((project) => [project.slug, project.updatedAt]))
const pulledProjects = await pullProjects()

// The website decides what it can use; ask its own code, loaded through Vite like the seed export does.
const { createServer } = await import(pathToFileURL(join(root, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href)
const vite = await createServer({ root, appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' })
let problems
try {
  const { catalogProblems } = await vite.ssrLoadModule('/src/content/catalogOverlay.ts')
  const { basePackages } = await vite.ssrLoadModule('/src/content/packages.ts')
  const { baseAddons } = await vite.ssrLoadModule('/src/content/services/addons.ts')
  const { baseServiceAreas } = await vite.ssrLoadModule('/src/content/services/areas.ts')
  problems = catalogProblems(catalog, {
    packages: basePackages.map((pack) => pack.id),
    extras: baseAddons.map((addon) => addon.id),
    services: baseServiceAreas.map((area) => area.id),
  })
} finally {
  await vite.close()
}

const document = { generatedAt: new Date().toISOString(), source: base.origin, ...catalog }

if (args.has('--check')) {
  let current = null
  try {
    current = JSON.parse(readFileSync(target, 'utf8'))
  } catch {
    // no file, or not JSON: out of date
  }
  let currentProjects = null
  try {
    currentProjects = JSON.parse(readFileSync(projectsTarget, 'utf8'))
  } catch {
    // no file, or not JSON
  }
  const projectsCurrent = pulledProjects === null ? currentProjects === null : projectsSignature(currentProjects?.projects) === projectsSignature(pulledProjects.projects)
  if (current?.version === catalog.version && projectsCurrent) {
    console.log(`catalog:pull: the generated files are the backend's current catalogue (version ${catalog.version}) and projects.`)
    process.exit(0)
  }
  console.error(`catalog:pull: the website is built from ${current ? `version ${current.version}` : 'the static content'}${projectsCurrent ? '' : ' and an out-of-date list of projects'}; the backend is at version ${catalog.version}. Run npm run catalog:pull and rebuild.`)
  process.exit(1)
}

const temporary = `${target}.tmp`
await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`)
await rename(temporary, target)
if (pulledProjects) {
  const projectsDocument = { generatedAt: document.generatedAt, source: base.origin, ...pulledProjects }
  await writeFile(`${projectsTarget}.tmp`, `${JSON.stringify(projectsDocument, null, 2)}
`)
  await rename(`${projectsTarget}.tmp`, projectsTarget)
  console.log(`catalog:pull: ${pulledProjects.projects.length} published project(s) -> src/content/projects.generated.json`)
} else {
  // A backend without the portfolio: a list pulled earlier from another one must not stay behind.
  await rm(projectsTarget, { force: true })
  console.log("catalog:pull: the backend has no /api/projects; the build keeps the website's own projects.")
}
console.log(`catalog:pull: ${catalog.services.length} services, ${catalog.packages.length} packages, ${catalog.extras.length} add-ons, ${catalog.faq.length} FAQ entries (version ${catalog.version}) from ${base.origin} -> src/content/catalog.generated.json`)
if (problems.length > 0) {
  console.warn(`\ncatalog:pull: ${problems.length} thing(s) in the backend will not reach the website:`)
  for (const problem of problems) console.warn(`  - ${problem}`)
}
