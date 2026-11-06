// Writes the backend's seed files from the website's static content (src/content/*Export.ts):
//   server/seed/catalog.seed.json     services, packages, add-ons, FAQ
//   server/seed/projects.seed.json    the four projects, their categories and the pictures that ship with the website
//   server/seed/texts.manifest.json   the wordings an administrator may override
// The website's modules import each other without file extensions, so they are loaded through Vite, not Node.
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { createServer } = await import(pathToFileURL(join(root, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href)
const vite = await createServer({ root, appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' })
try {
  const { buildCatalogSeed } = await vite.ssrLoadModule('/src/content/catalogExport.ts')
  const seed = buildCatalogSeed()
  await writeFile(join(root, 'server', 'seed', 'catalog.seed.json'), `${JSON.stringify(seed, null, 2)}\n`)
  console.log(`catalog seed: ${seed.services.length} services, ${seed.packages.length} packages, ${seed.extras.length} add-ons, ${seed.faq.length} FAQ entries -> server/seed/catalog.seed.json`)

  const { buildProjectsSeed } = await vite.ssrLoadModule('/src/content/projectsExport.ts')
  const projects = buildProjectsSeed()
  // The pictures that ship with the website: the file's own size and hash, read from public/.
  projects.media = projects.media.map((item) => {
    const file = join(root, 'public', item.path.replace(/^\//, ''))
    return { ...item, bytes: statSync(file).size, sha256: createHash('sha256').update(readFileSync(file)).digest('hex') }
  })
  await writeFile(join(root, 'server', 'seed', 'projects.seed.json'), `${JSON.stringify(projects, null, 2)}\n`)
  console.log(`projects seed: ${projects.projects.length} projects, ${projects.categories.length} categories, ${projects.media.length} pictures -> server/seed/projects.seed.json`)

  const { buildTextsManifest } = await vite.ssrLoadModule('/src/content/textsExport.ts')
  const manifest = buildTextsManifest()
  await writeFile(join(root, 'server', 'seed', 'texts.manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`)
  console.log(`texts manifest: ${manifest.keys.length} editable wordings -> server/seed/texts.manifest.json`)
} finally {
  await vite.close()
}
