// `npm run i18n:check | i18n:validate | i18n:report`: the language quality checks (src/i18n/quality/).
//   node scripts/i18n.mjs check      completeness, placeholders, numbers, glossary, register, untranslated text, hard-coded words (fast; part of the build)
//   node scripts/i18n.mjs validate   characters, spaces, quotes, brackets and spelling against real dictionaries
//   node scripts/i18n.mjs report     everything, with counts and the keys that look unused; --write=<file> saves it as Markdown
// The website's modules import each other without file extensions, so they are loaded through Vite, not Node.
import { writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const mode = process.argv[2]
if (!['check', 'validate', 'report'].includes(mode)) {
  console.error('usage: node scripts/i18n.mjs <check|validate|report> [--all] [--write=<file>]')
  process.exit(2)
}
const all = process.argv.includes('--all')
const write = process.argv.find((argument) => argument.startsWith('--write='))?.slice('--write='.length)

const { createServer } = await import(pathToFileURL(join(root, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href)
const vite = await createServer({ root, appType: 'custom', server: { middlewareMode: true }, logLevel: 'error' })
let exitCode = 1
try {
  const { run } = await vite.ssrLoadModule('/src/i18n/quality/run.ts')
  const result = await run({ root, mode, all })
  console.log(result.output)
  if (write) {
    await writeFile(resolve(root, write), result.markdown)
    console.log(`written to ${write}`)
  }
  exitCode = result.exitCode
} catch (error) {
  console.error(error)
} finally {
  await vite.close()
}
process.exit(exitCode)
