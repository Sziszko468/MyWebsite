// Writes server/seed/catalog.seed.json from the website's static catalogue (src/content/catalogExport.ts).
// The website's modules import each other without file extensions, so they are loaded through Vite, not Node.
import { writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { createServer } = await import(pathToFileURL(join(root, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href)
const vite = await createServer({ root, appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' })
try {
  const { buildCatalogSeed } = await vite.ssrLoadModule('/src/content/catalogExport.ts')
  const seed = buildCatalogSeed()
  const target = join(root, 'server', 'seed', 'catalog.seed.json')
  await writeFile(target, `${JSON.stringify(seed, null, 2)}\n`)
  console.log(`catalog seed: ${seed.services.length} services, ${seed.packages.length} packages, ${seed.extras.length} add-ons, ${seed.faq.length} FAQ entries -> server/seed/catalog.seed.json`)
} finally {
  await vite.close()
}
