#!/usr/bin/env node
/**
 * Structure audit (PROMPT 15, phase 2): which files nothing reaches, which dependencies nothing imports, which
 * colours are written outside the design tokens, and which environment variables are named in one place but not
 * another. Pure reading of the repository: no build, no browser, no dependency.
 *
 *   node tools/audit/audit-structure.cjs            # report, exit 1 on a finding that is not on the allow-list
 *   node tools/audit/audit-structure.cjs --json     # the same as JSON
 *
 * "Reached" means: imported (statically, dynamically, from SCSS with @use/@forward/@import, or by `new URL(...)`)
 * from one of the entry points, following the chain. A file only a test imports is reported separately: it is live
 * code that a test keeps alive, not an orphan, but it is worth a look.
 */
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..', '..')
const json = process.argv.includes('--json')
const rel = (file) => path.relative(root, file).split(path.sep).join('/')

// ---------------------------------------------------------------------------------------------------------------
// files
// ---------------------------------------------------------------------------------------------------------------
const SOURCE_DIRS = ['src', 'server/src', 'scripts']
const CODE = /\.(tsx?|mjs|cjs|jsx?|scss|css)$/
function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (CODE.test(entry.name)) out.push(full)
  }
  return out
}
const isTest = (file) => /\.test\.(tsx?|mjs|cjs)$/.test(file) || /[\\/]test[\\/]/.test(file)
const files = SOURCE_DIRS.flatMap((dir) => walk(path.join(root, dir)))
const exists = new Set(files)

const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.scss', '.css', '/index.ts', '/index.tsx', '/index.js']
function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null
  const base = path.resolve(path.dirname(from), spec.split('?')[0])
  for (const extension of EXTENSIONS) {
    const candidate = path.normalize(base + extension) // `dir` + `/index.ts` must equal the walked `dir\index.ts` on Windows
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  // SCSS partials: _name.scss
  const partial = path.join(path.dirname(base), `_${path.basename(base)}.scss`)
  if (fs.existsSync(partial)) return partial
  const sassIndex = path.join(base, '_index.scss')
  if (fs.existsSync(sassIndex)) return sassIndex
  return null
}

const IMPORT_PATTERNS = [
  /\bimport\s+(?:type\s+)?(?:[\w*${}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g,
  /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  /@(?:use|forward|import)\s+['"]([^'"]+)['"]/g,
  /new URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g,
  /\?raw|\?url/g,
]
function importsOf(file) {
  const text = fs.readFileSync(file, 'utf8')
  const found = []
  for (const pattern of IMPORT_PATTERNS.slice(0, 6)) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(text))) found.push(match[1])
  }
  return found
}

// ---------------------------------------------------------------------------------------------------------------
// reachability
// ---------------------------------------------------------------------------------------------------------------
const ENTRIES = [
  'src/main.tsx',
  'src/admin/main.tsx',
  'src/seo/entry.ts',
  'server/src/main.ts',
  'server/src/cli.ts',
  // Scripts are run by npm, not imported.
  ...walk(path.join(root, 'scripts')).map(rel),
].map((entry) => path.join(root, entry)).filter((entry) => fs.existsSync(entry))

function reach(entries, skip = () => false) {
  const seen = new Set()
  const queue = [...entries]
  while (queue.length) {
    const file = queue.pop()
    if (seen.has(file)) continue
    seen.add(file)
    if (!CODE.test(file)) continue
    for (const spec of importsOf(file)) {
      const target = resolveImport(file, spec)
      if (target && !seen.has(target) && !skip(target)) queue.push(target)
    }
  }
  return seen
}
const live = reach(ENTRIES, isTest)
const testEntries = files.filter(isTest)
const withTests = reach([...ENTRIES, ...testEntries])

const orphans = []
const testOnly = []
for (const file of files) {
  if (isTest(file) || live.has(file)) continue
  if (/\.d\.ts$/.test(file)) continue
  ;(withTests.has(file) ? testOnly : orphans).push(rel(file))
}

// ---------------------------------------------------------------------------------------------------------------
// dependencies
// ---------------------------------------------------------------------------------------------------------------
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const allText = [...files, ...walk(path.join(root, 'tools')), ...['vite.config.ts', 'index.html', 'admin.html'].map((f) => path.join(root, f))]
  .filter((f) => fs.existsSync(f))
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n')
const unusedDependencies = []
for (const name of Object.keys(pkg.dependencies ?? {})) {
  const short = name.replace(/^@types\//, '')
  if (!allText.includes(`'${name}`) && !allText.includes(`"${name}`) && !allText.includes(`${name}/`)) unusedDependencies.push(`${name} (dependencies)`)
  void short
}
// Dev tooling that is used through scripts or configuration rather than imports.
const BY_CONFIGURATION = new Set(['oxlint', 'typescript', 'sass', 'vite', 'vitest', '@vitejs/plugin-react', '@types/node', '@types/react', '@types/react-dom', '@types/three'])
for (const name of Object.keys(pkg.devDependencies ?? {})) {
  if (BY_CONFIGURATION.has(name)) continue
  if (!allText.includes(`'${name}`) && !allText.includes(`"${name}`)) unusedDependencies.push(`${name} (devDependencies)`)
}

// ---------------------------------------------------------------------------------------------------------------
// colours written outside the tokens
// ---------------------------------------------------------------------------------------------------------------
const BRAND = { '#ff161f': 'Racing Red', '#0b0b0d': 'Carbon Black', '#445cff': 'Cobalt Blue', '#f4f0e8': 'Warm Paper', '#303036': 'Graphite' }
const styleFiles = files.filter((f) => /\.(scss|css)$/.test(f))
const tokenFiles = styleFiles.filter((f) => /tokens\.css$|[\\/]admin[\\/]styles[\\/]tokens/.test(f))
const hexOutside = []
const HEX = /#[0-9a-fA-F]{3,8}\b/g
for (const file of styleFiles) {
  if (tokenFiles.includes(file)) continue
  const text = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const lines = text.split(/\r?\n/)
  lines.forEach((line, index) => {
    if (/^\s*\/\//.test(line)) return
    const hits = line.match(HEX)
    if (hits) hexOutside.push(`${rel(file)}:${index + 1}  ${hits.join(' ')}`)
  })
}
const tokenText = tokenFiles.map((f) => fs.readFileSync(f, 'utf8').toLowerCase()).join('\n')
const brandInTokens = Object.fromEntries(Object.entries(BRAND).map(([hex, name]) => [name, tokenText.includes(hex)]))

// ---------------------------------------------------------------------------------------------------------------
// environment variables
// ---------------------------------------------------------------------------------------------------------------
const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8')
const documented = new Set([...envExample.matchAll(/^#?\s*([A-Z][A-Z0-9_]{2,})=/gm)].map((m) => m[1]))
const usedByServer = new Set()
for (const file of walk(path.join(root, 'server/src'))) {
  for (const match of fs.readFileSync(file, 'utf8').matchAll(/\b(?:env|process\.env)\.([A-Z][A-Z0-9_]{2,})\b|\bget\w*\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g)) usedByServer.add(match[1] ?? match[2])
}
for (const file of [path.join(root, 'server/src/config.ts')]) {
  for (const match of fs.readFileSync(file, 'utf8').matchAll(/['"]([A-Z][A-Z0-9_]{3,})['"]/g)) usedByServer.add(match[1])
}
const usedByWebsite = new Set()
for (const file of [...walk(path.join(root, 'src')), path.join(root, 'vite.config.ts')]) {
  for (const match of fs.readFileSync(file, 'utf8').matchAll(/import\.meta\.env\.(VITE_[A-Z0-9_]+)/g)) usedByWebsite.add(match[1])
}
const undocumented = [...usedByServer, ...usedByWebsite].filter((name) => !documented.has(name) && /^(VITE_|[A-Z]+_)/.test(name)).sort()
const unread = [...documented].filter((name) => !usedByServer.has(name) && !usedByWebsite.has(name)).sort()

// ---------------------------------------------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------------------------------------------
const report = {
  filesScanned: files.length,
  entries: ENTRIES.map(rel),
  orphans,
  testOnly,
  unusedDependencies,
  brandInTokens,
  hexOutsideTokens: hexOutside,
  envUsedButNotInExample: undocumented,
  envInExampleButNotRead: unread,
}
if (json) console.log(JSON.stringify(report, null, 2))
else {
  const section = (title, list) => {
    console.log(`\n${title} (${Array.isArray(list) ? list.length : ''})`)
    if (Array.isArray(list)) for (const item of list) console.log(`  ${item}`)
    else console.log(`  ${JSON.stringify(list)}`)
  }
  console.log(`scanned ${report.filesScanned} source files from ${ENTRIES.length} entry points`)
  section('Files nothing reaches', orphans)
  section('Files only a test reaches', testOnly)
  section('Dependencies nothing imports', unusedDependencies)
  section('Brand colours present in the token files', brandInTokens)
  section('Hex colours outside the token files', hexOutside)
  section('Environment variables read by the code but not in .env.example', undocumented)
  section('Environment variables in .env.example but not read by the code', unread)
}
process.exit(orphans.length || unusedDependencies.length ? 1 : 0)
