import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { allowances } from './allowances'
import { scanHardcoded } from './hardcoded'
import { buildInventory } from './inventory'
import { checkEntry, noAllowances, numbersOf, placeholdersOf } from './rules'
import { wordsToCheck } from './spelling'
import type { TextEntry } from './types'
import { walkTexts } from './walk'

const SRC = join(process.cwd(), 'src')

const entry = (hu: string | undefined, en: string | undefined, nl: string | undefined, id = 'test.entry'): TextEntry => ({ id, source: 'test', area: 'test', texts: { hu, en, nl } })
const rules = (text: TextEntry) => checkEntry(text, noAllowances).map((finding) => finding.rule)

describe('finding the texts', () => {
  it('reads a text with its three versions, and a language-keyed pair of trees', () => {
    const found = walkTexts({ title: { hu: 'a', en: 'b', nl: 'c' }, tree: { hu: { x: 'h' }, en: { x: 'e' }, nl: { x: 'n' } }, id: 'plain', n: 3 }, 'root')
    expect(found.entries.map((item) => item.id).sort()).toEqual(['root.title', 'root.tree.x'])
    expect(found.entries.find((item) => item.id === 'root.tree.x')?.texts).toEqual({ hu: 'h', en: 'e', nl: 'n' })
  })

  it('reports a text that has lost a language', () => {
    const found = walkTexts({ title: { hu: 'a', en: 'b' } }, 'root')
    expect(found.findings.map((finding) => finding.rule)).toEqual(['missing'])
  })

  it('does not take a map of language names for one text in three languages', () => {
    const names = { hu: { hu: 'Magyar', en: 'Hungarian', nl: 'Hongaars' }, en: { hu: 'Angol', en: 'English', nl: 'Engels' }, nl: { hu: 'Holland', en: 'Dutch', nl: 'Nederlands' } }
    const found = walkTexts(names, 'languages')
    expect(found.entries.map((item) => item.id).sort()).toEqual(['languages.en', 'languages.hu', 'languages.nl'])
    expect(found.findings).toEqual([])
  })

  it('counts an object that two modules both export once', () => {
    const shared = { title: { hu: 'a', en: 'b', nl: 'c' } }
    const seen = new WeakSet<object>()
    expect(walkTexts(shared, 'first', seen).entries).toHaveLength(1)
    expect(walkTexts(shared, 'second', seen).entries).toHaveLength(0)
  })
})

describe('the rules', () => {
  it('flags a missing or empty language', () => {
    expect(rules(entry('a', undefined, 'c'))).toContain('missing')
    expect(rules(entry('a', 'b', ' '))).toContain('empty')
  })

  it('leaves a field that is blank in every language alone', () => {
    expect(rules(entry('', '', ''))).toEqual([])
  })

  it('compares placeholders and numbers across languages', () => {
    expect(placeholdersOf('Hello {name}, {count} left')).toEqual(['count', 'name'])
    expect(numbersOf('1,5 and 20 steps, {n1}')).toEqual(['1.5', '20'])
    expect(rules(entry('Szia {nev}', 'Hello {name}', 'Hallo {name}'))).toContain('placeholders')
    expect(rules(entry('3 lépés', '4 steps', '4 stappen'))).toContain('numbers')
    expect(rules(entry('4 lépés', '4 steps', '4 stappen'))).toEqual([])
  })

  it('flags broken characters, stray spaces and straight quotes', () => {
    expect(rules(entry('Ã©s', 'and', 'en'))).toContain('encoding')
    expect(rules(entry('és', 'and ', 'en'))).toContain('whitespace')
    expect(rules(entry('és', 'and  more', 'en'))).toContain('whitespace')
    expect(rules(entry('és', 'and', 'en , more'))).toContain('whitespace')
    expect(rules(entry('és', 'say "hi"', 'zeg hi'))).toContain('quotes')
    expect(rules(entry('és', 'it\'s', 'het is'))).toContain('quotes')
    expect(rules(entry('„szia”', 'say “hi”', 'zeg ‘hallo’'))).toEqual([])
    expect(rules(entry('és', 'say „hi”', 'zeg hi'))).toContain('quotes')
  })

  it('flags Latin-2 letters in Hungarian and unbalanced brackets', () => {
    expect(rules(entry('õ', 'o', 'o'))).toContain('diacritics')
    expect(rules(entry('(egy', 'one', 'een'))).toContain('brackets')
  })

  it('flags a formal address in a site that says "te" and "je"', () => {
    expect(rules(entry('Kérjük, ossza meg', 'Please share', 'Deel het'))).toContain('register')
    expect(rules(entry('Kérlek, oszd meg', 'Please share', 'Wilt u dit delen?'))).toContain('register')
    expect(rules(entry('Kérlek, oszd meg', 'Please share', 'Deel je dit?'))).toEqual([])
  })

  it('flags a raw key or a programming leftover, with accents not counting as word edges', () => {
    expect(rules(entry('home.hero.title', 'x y z', 'x y z'))).toContain('junk')
    expect(rules(entry('undefined', 'x', 'y'))).toContain('junk')
    expect(rules(entry('Nem a nulláról indultam', 'I did not start from zero', 'Ik begon niet vanaf nul'))).not.toContain('junk')
  })

  it('flags a language that carries the same sentence as another, unless the text is a name', () => {
    expect(rules(entry('Start your project today', 'Start your project today', 'Begin vandaag'))).toContain('untranslated')
    expect(checkEntry(entry('Spendly', 'Spendly', 'Spendly'), allowances)).toEqual([])
    expect(checkEntry(entry('React 19 · TypeScript · Vite', 'React 19 · TypeScript · Vite', 'React 19 · TypeScript · Vite'), allowances)).toEqual([])
  })

  it('applies the glossary: one word per concept', () => {
    expect(rules(entry('Árajánlat', 'Quotation', 'Offerte'))).toEqual(expect.arrayContaining(['glossary']))
    expect(rules(entry('Kiegészítő', 'Add-ons', 'Toevoegingen'))).toContain('glossary')
    expect(rules(entry('E-mail', 'Your e-mail', 'E-mail'))).toContain('glossary')
    expect(rules(entry('Ajánlat', 'Quote', 'Offerte'))).toEqual([])
  })
})

describe('what is looked up in a dictionary', () => {
  it('leaves placeholders, addresses and short words out', () => {
    expect(wordsToCheck('Hello {name}, mail info@example.com or see https://example.com/x for it')).toEqual(['Hello', 'mail', 'see', 'for'])
  })
  it('keeps a hyphenated word whole and drops the quote before a hyphen and the empty brackets of a call', () => {
    expect(wordsToCheck('een ‘Vandaag’-knop en Number()-rel')).toEqual(['een', 'Vandaag-knop', 'Number-rel'])
  })
})

describe('the website’s own texts', () => {
  it('has every text in every language, with the same placeholders and numbers, in one register and one glossary', async () => {
    const inventory = await buildInventory()
    expect(inventory.findings).toEqual([])
    expect(inventory.entries.length).toBeGreaterThan(2000)
    const errors = inventory.entries.flatMap((text) => checkEntry(text, allowances)).filter((finding) => finding.severity === 'error')
    expect(errors.map((finding) => `${finding.rule} ${finding.id} ${finding.lang ?? ''}: ${finding.message}`)).toEqual([])
  })

  it('reads every file that writes texts with tri() (a new content file must be added to the inventory on purpose)', async () => {
    const inventory = await buildInventory()
    const read = new Set(inventory.sources)
    const writers: string[] = []
    const scan = (directory: string) => {
      for (const name of readdirSync(directory)) {
        const path = join(directory, name)
        if (statSync(path).isDirectory()) scan(path)
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const relativePath = relative(SRC, path).split(sep).join('/')
          if (relativePath.startsWith('admin/') || relativePath.startsWith('i18n/quality/') || relativePath === 'content/trilingual.ts') continue
          if (/\btri\(/.test(readFileSync(path, 'utf8'))) writers.push(relativePath)
        }
      }
    }
    scan(SRC)
    // The seed exporters and the live overlay use tri() to read or rebuild texts, not to write them.
    const notTexts = new Set(['content/projectsExport.ts', 'content/catalogExport.ts', 'content/profileExport.ts', 'content/textsExport.ts', 'content/liveCatalog.ts', 'content/catalogOverlay.ts', 'content/textOverrides.ts', 'projects/api.ts'])
    expect(writers.filter((file) => !read.has(file) && !notTexts.has(file))).toEqual([])
  })

  it('has no customer-facing word written straight into a component', () => {
    expect(scanHardcoded(SRC).map((finding) => `${finding.id}: ${finding.sample}`)).toEqual([])
  })
})
