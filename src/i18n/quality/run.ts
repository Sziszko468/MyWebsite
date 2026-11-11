import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { LANGUAGES, type Language } from '../config'
import { allowances } from './allowances'
import { scanHardcoded } from './hardcoded'
import { buildInventory } from './inventory'
import { checkEntries } from './rules'
import { checkSpelling, loadSpellCheckers, type SpellingResult } from './spelling'
import type { Finding, Inventory } from './types'

/**
 * The three commands behind `npm run i18n:check`, `i18n:validate` and `i18n:report`.
 *
 *   check     does every language have every text, with the same placeholders and numbers, in the words the glossary asks for,
 *             in the register the site speaks, and without a customer-facing word hidden in a component? (fast; part of the build)
 *   validate  are the texts clean: characters, spaces, quotes, brackets, and spelling against real dictionaries
 *   report    everything above as a readable summary with counts, plus the keys that look unused
 *
 * `check` and `validate` fail (exit code 1) on any error; warnings are listed and never fail a run.
 */

export type Mode = 'check' | 'validate' | 'report'

const CHECK_RULES = new Set(['load', 'missing', 'empty', 'placeholders', 'numbers', 'junk', 'glossary', 'register', 'untranslated', 'length', 'hardcoded'])
const VALIDATE_RULES = new Set(['encoding', 'diacritics', 'whitespace', 'quotes', 'brackets', 'spelling'])

export interface RunResult {
  exitCode: number
  output: string
  markdown: string
}

function sourcesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return sourcesUnder(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

/** Dictionary keys whose last name appears nowhere in the code that reads texts. A signal to look at, never proof. */
function possiblyUnused(inventory: Inventory, srcDirectory: string): { unused: string[]; unverifiable: number } {
  const GENERIC = new Set(['title', 'text', 'label', 'intro', 'lead', 'name', 'items', 'description', 'cta', 'heading', 'one', 'other', 'hint', 'note', 'empty', 'error', 'errors', 'open', 'close', 'next', 'back'])
  const code = sourcesUnder(srcDirectory)
    .filter((file) => {
      const name = relative(srcDirectory, file).split(sep).join('/')
      return !name.startsWith('i18n/locales/') && !name.startsWith('i18n/quality/') && !name.startsWith('admin/')
    })
    .map((file) => readFileSync(file, 'utf8'))
    .join('\n')
  const identifiers = new Set(code.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [])
  const unused: string[] = []
  let unverifiable = 0
  for (const entry of inventory.entries) {
    if (!entry.id.startsWith('dict.')) continue
    const leaf = (entry.id.split('.').pop() ?? '').replace(/\[\d+\]$/, '')
    if (GENERIC.has(leaf) || leaf.length < 4) {
      unverifiable += 1
      continue
    }
    if (!identifiers.has(leaf)) unused.push(entry.id)
  }
  return { unused, unverifiable }
}

function table(rows: string[][]): string {
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)))
  return rows.map((row) => row.map((cell, column) => cell.padEnd(widths[column])).join('  ')).join('\n')
}

function describe(finding: Finding): string {
  return `  [${finding.rule}] ${finding.id}${finding.lang ? ` (${finding.lang.toUpperCase()})` : ''}: ${finding.message}${finding.sample ? `\n      ${finding.sample}` : ''}`
}

export async function run(options: { root: string; mode: Mode; all?: boolean }): Promise<RunResult> {
  const { root, mode } = options
  const src = join(root, 'src')
  const inventory = await buildInventory()
  const everything: Finding[] = [...inventory.findings, ...checkEntries(inventory.entries, allowances)]
  if (mode !== 'validate') everything.push(...scanHardcoded(src))

  let spelling: SpellingResult | null = null
  let skipped: Partial<Record<Language, string>> = {}
  let engines: Partial<Record<Language, string>> = {}
  if (mode !== 'check') {
    const loaded = await loadSpellCheckers(root)
    skipped = loaded.skipped
    engines = Object.fromEntries(Object.entries(loaded.checkers).map(([lang, checker]) => [lang, checker.engine]))
    spelling = checkSpelling(inventory.entries, loaded)
    everything.push(...spelling.findings)
    for (const checker of Object.values(loaded.checkers)) checker.dispose?.()
  }

  const selected = mode === 'report' ? everything : everything.filter((finding) => (mode === 'check' ? CHECK_RULES : VALIDATE_RULES).has(finding.rule))
  const errors = selected.filter((finding) => finding.severity === 'error')
  const warnings = selected.filter((finding) => finding.severity === 'warning')

  const complete = inventory.entries.filter((entry) => LANGUAGES.every((lang) => typeof entry.texts[lang] === 'string' && entry.texts[lang]!.trim() !== '')).length
  const byArea = new Map<string, number>()
  for (const entry of inventory.entries) byArea.set(entry.area, (byArea.get(entry.area) ?? 0) + 1)
  const words = Object.fromEntries(LANGUAGES.map((lang) => [lang, inventory.entries.reduce((sum, entry) => sum + ((entry.texts[lang] ?? '').match(/[\p{L}\p{N}]+/gu)?.length ?? 0), 0)])) as Record<Language, number>
  const unused = mode === 'report' ? possiblyUnused(inventory, src) : null

  const lines: string[] = []
  lines.push(`i18n ${mode}: ${inventory.entries.length} texts × ${LANGUAGES.length} languages from ${inventory.sources.length} sources`)
  lines.push(`  complete in all languages: ${complete} of ${inventory.entries.length}`)
  if (mode === 'report') {
    lines.push(`  words: ${LANGUAGES.map((lang) => `${lang.toUpperCase()} ${words[lang]}`).join(', ')}`)
    lines.push('  by area:')
    lines.push(table([...byArea.entries()].sort((a, b) => b[1] - a[1]).map(([area, count]) => [`    ${area}`, String(count)])))
  }
  if (spelling) {
    for (const lang of LANGUAGES) {
      lines.push(
        skipped[lang]
          ? `  spelling ${lang.toUpperCase()}: NOT CHECKED (${skipped[lang]})`
          : `  spelling ${lang.toUpperCase()}: ${spelling.stats[lang].checked} distinct words checked with ${engines[lang]}, ${spelling.stats[lang].misspelled} not found`,
      )
    }
  }
  if (unused) {
    lines.push(`  keys that look unused (leaf name appears nowhere else in the code): ${unused.unused.length}; not verifiable by name: ${unused.unverifiable}`)
    for (const id of unused.unused.slice(0, 60)) lines.push(`    ${id}`)
  }
  const byRule = new Map<string, number>()
  for (const finding of selected) byRule.set(`${finding.rule} (${finding.severity})`, (byRule.get(`${finding.rule} (${finding.severity})`) ?? 0) + 1)
  lines.push(`  errors: ${errors.length}, warnings: ${warnings.length}${byRule.size > 0 ? ` — ${[...byRule.entries()].map(([rule, count]) => `${rule} ${count}`).join(', ')}` : ''}`)
  const shown = options.all ? Number.POSITIVE_INFINITY : mode === 'report' ? 400 : 150
  for (const finding of [...errors, ...warnings].slice(0, shown)) lines.push(describe(finding))
  if (selected.length > shown) lines.push(`  … and ${selected.length - shown} more (run with --all to see every one)`)
  if (Object.keys(skipped).length > 0 && mode !== 'check') lines.push('  NOTE: a language that was not spell-checked has NOT passed the spelling check.')
  lines.push(errors.length === 0 ? `i18n ${mode}: OK` : `i18n ${mode}: FAILED (${errors.length} errors)`)

  const markdown = [
    `# i18n ${mode}`,
    '',
    '```text',
    ...lines,
    '```',
    '',
  ].join('\n')
  return { exitCode: errors.length === 0 ? 0 : 1, output: lines.join('\n'), markdown }
}
