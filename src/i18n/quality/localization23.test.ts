import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { randomIdea } from '../../components/lab/experiments/generative/ideas'
import { LANGUAGES, type Language } from '../config'
import { allowances, foreignPhraseReasons } from './allowances'
import { foreignIn } from './foreign'
import { glossary, QUOTATION_DOCUMENTS } from './glossary'
import { buildInventory } from './inventory'
import { scanLiterals } from './literals'
import { LOCALE_ALLOWED, scanLocaleReferences } from './locales'
import { checkEntry, noAllowances } from './rules'
import type { TextEntry } from './types'

/**
 * The checks added in PROMPT 23: words of another language inside a text, the glossary's scope and honesty, references to a language
 * or a locale in the source, and sentences written into code.
 */

const SRC = join(process.cwd(), 'src')
const entry = (hu: string, en: string, nl: string, source = 'test'): TextEntry => ({ id: 'test.entry', source, area: 'test', texts: { hu, en, nl } })
const rulesOf = (text: TextEntry, allow = noAllowances) => checkEntry(text, allow).map((finding) => `${finding.rule}:${finding.lang ?? ''}`)

describe('words of another language inside a text (rule "foreign")', () => {
  it('finds English words in Hungarian and Dutch, Hungarian words in English and Dutch, Dutch words in English and Hungarian', () => {
    expect(foreignIn('Kattints ide and kezdd el', 'hu')).toEqual([{ from: 'en', words: ['and'] }])
    expect(foreignIn('Je kunt the offerte lezen', 'nl')).toEqual([{ from: 'en', words: ['the'] }])
    expect(foreignIn('You can start és read it', 'en')).toEqual([{ from: 'hu', words: ['és'] }])
    expect(foreignIn('Dit is een offerte nem een mail', 'nl')).toEqual([{ from: 'hu', words: ['nem'] }])
    expect(foreignIn('Please read het before you start', 'en')).toEqual([{ from: 'nl', words: ['het'] }])
    expect(foreignIn('Olvasd el niet and the', 'hu').map((hit) => hit.from).sort()).toEqual(['en', 'nl'])
  })

  it('reports the Hungarian letters ő and ű in English and Dutch, where no word has them', () => {
    expect(foreignIn('Hollandia Kezdőknek', 'en')).toEqual([{ from: 'hu', words: ['ő'] }])
    expect(foreignIn('Egy űrhajó', 'nl').some((hit) => hit.from === 'hu')).toBe(true)
    expect(foreignIn('Kezdőknek űrlap', 'hu')).toEqual([])
  })

  it('does not take a word for foreign when it is a word of its own language too (most, over, van, is)', () => {
    expect(foreignIn('Most nincs idő, de van másik út', 'hu')).toEqual([])
    expect(foreignIn('Move over the form: it is on', 'en')).toEqual([])
    expect(foreignIn('Check het over, dit is van jou', 'nl').map((hit) => hit.from)).toEqual([])
    expect(foreignIn('Over de volgende stap is dit', 'nl')).toEqual([])
  })

  it('leaves placeholders, addresses, code in backticks and the named phrases out', () => {
    expect(foreignIn('Szia {name}, írj a hello@example.com címre: https://example.com/the/and', 'hu')).toEqual([])
    expect(foreignIn('Használd a `with` és `from` szót', 'hu')).toEqual([])
    expect(foreignIn('Küld a Do Not Track jelzést', 'hu')).toEqual([{ from: 'en', words: ['not'] }])
    expect(foreignIn('Küld a Do Not Track jelzést', 'hu', allowances.foreignPhrases)).toEqual([])
  })

  it('is a finding of the site-wide check, with the language and the words named', () => {
    const found = checkEntry(entry('Kattints and kezdd el', 'Click and start', 'Klik en begin'), noAllowances).filter((finding) => finding.rule === 'foreign')
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ lang: 'hu', severity: 'error' })
    expect(found[0].message).toContain('EN words: and')
  })

  it('has a reason for every phrase it lets through', () => {
    expect(foreignPhraseReasons.length).toBeGreaterThan(0)
    for (const { phrase, reason } of foreignPhraseReasons) expect(reason.length, phrase).toBeGreaterThan(20)
  })

  it('finds nothing in the sentences the Generative Objects experience writes for “Surprise me”, in any language', () => {
    for (const lang of LANGUAGES) {
      for (let seed = 1; seed <= 150; seed += 1) {
        const { text } = randomIdea(null, lang, seed)
        expect(foreignIn(text, lang, allowances.foreignPhrases), `${lang} #${seed}: ${text}`).toEqual([])
      }
    }
  })
})

describe('the glossary', () => {
  it('forbids “enquiry” everywhere and “offer”/“voorstel” only where the quote document is meant', () => {
    expect(rulesOf(entry('Megkeresés', 'Your enquiry', 'Aanvraag'))).toContain('glossary:en')
    expect(rulesOf(entry('Megkeresés', 'Your inquiry', 'Aanvraag'))).toEqual([])
    const quotation = 'content/quotes/index.ts'
    expect(rulesOf(entry('Az ajánlat lejárt', 'This offer has expired', 'Deze offerte is verlopen', quotation))).toContain('glossary:en')
    expect(rulesOf(entry('Az ajánlat lejárt', 'This quote has expired', 'Dit voorstel is verlopen', quotation))).toContain('glossary:nl')
    expect(rulesOf(entry('Az ajánlat lejárt', 'This quote has expired', 'Deze offerte is verlopen', quotation))).toEqual([])
    // Elsewhere the same words are right: a package is "not a final offer", and a voorstel is a suggestion.
    const shop = 'content/shop/landing.ts'
    expect(rulesOf(entry('Nem végleges ajánlatok', 'They are not final offers', 'Het zijn geen definitieve aanbiedingen', shop))).toEqual([])
    expect(rulesOf(entry('Egy javaslat', 'A suggestion', 'Een voorstel om mee te beginnen', shop))).toEqual([])
  })

  it('names the files of the quote document: the customer pages and the e-mails about a quotation, nothing else', () => {
    expect(QUOTATION_DOCUMENTS.test('content/quotes/index.ts')).toBe(true)
    expect(QUOTATION_DOCUMENTS.test('server/src/modules/notifications/quoteTemplates.ts')).toBe(true)
    expect(QUOTATION_DOCUMENTS.test('server/src/modules/notifications/templates.ts')).toBe(false)
    expect(QUOTATION_DOCUMENTS.test('content/shop/landing.ts')).toBe(false)
  })

  it('describes the site as it is: every approved word is used somewhere in the site’s own texts, in its language', async () => {
    const inventory = await buildInventory()
    const missing: string[] = []
    for (const term of glossary) {
      for (const lang of LANGUAGES) {
        const pattern = term.appears?.[lang]
        if (pattern && !inventory.entries.some((item) => pattern.test(item.texts[lang] ?? ''))) missing.push(`${term.concept} (${lang}): ${pattern}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('gives every concept a word in each language and does not forbid its own approved word', () => {
    for (const term of glossary) {
      for (const lang of LANGUAGES) {
        expect(term.use[lang].length, `${term.concept} ${lang}`).toBeGreaterThan(2)
        for (const bad of term.forbidden[lang] ?? []) expect(bad.test(term.use[lang].replace(/ \(.*/, '')), `${term.concept} forbids its own word in ${lang}`).toBe(false)
      }
    }
    expect(glossary.length).toBeGreaterThanOrEqual(9)
  })
})

describe('references to a language or a locale in the source (rule "locale")', () => {
  const folders: string[] = []
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
  })
  const project = (files: Record<string, string>): string => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-locale-'))
    folders.push(dir)
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(dir, name, '..'), { recursive: true })
      writeFileSync(join(dir, name), text)
    }
    return dir
  }
  const scan = (files: Record<string, string>) => {
    const dir = project(files)
    return scanLocaleReferences([{ directory: dir, base: dir }]).map((finding) => `${finding.id.split(':')[0]}: ${finding.sample}`)
  }

  it('finds a language the site does not have, in an attribute, a hreflang, a comparison and an address', () => {
    expect(
      scan({
        'a.tsx': `export const A = () => <a href="/x" hrefLang="de" lang="fr">x</a>`,
        'b.ts': `export const alt = { hreflang: 'es', href: '/y' }\nexport const same = (lang: string) => lang === 'it'\nexport const path = '/de/services/'`,
      }),
    ).toEqual(['a.tsx: de', 'a.tsx: fr', 'b.ts: es', 'b.ts: it', 'b.ts: /de/services/'])
  })

  it('accepts the three languages, x-default and the addresses of the site', () => {
    expect(
      scan({
        'ok.tsx': `export const A = () => <a hrefLang="nl" lang="hu">x</a>`,
        'ok.ts': `export const alt = { hreflang: 'x-default' }\nexport const same = (lang: string) => lang === 'en'\nexport const path = '/en/services/'\nexport const api = '/api/db/'`,
      }),
    ).toEqual([])
  })

  it('finds a locale that is not one of the site’s tags: a bare language, American English, a made-up tag', () => {
    expect(
      scan({
        'dates.ts': [
          `export const a = (lang: string) => new Intl.DateTimeFormat(lang, { dateStyle: 'long' }).format(new Date())`,
          `export const b = new Intl.NumberFormat('en-US').format(1)`,
          `export const c = new Date().toLocaleDateString('en')`,
          `export const d = (language: string) => new Date().toLocaleString(language)`,
        ].join('\n'),
      }),
    ).toEqual(['dates.ts: lang', 'dates.ts: en-US', 'dates.ts: en', 'dates.ts: language'])
  })

  it('accepts the site’s own tags, a tag taken from the table, and the visitor’s own browser setting', () => {
    expect(
      scan({
        'good.ts': [
          `const LOCALE_TAGS: Record<string, string> = { hu: 'hu-HU', en: 'en-GB', nl: 'nl-NL' }`,
          `export const a = (lang: string) => new Intl.DateTimeFormat(LOCALE_TAGS[lang], { dateStyle: 'long' }).format(new Date())`,
          `export const b = new Intl.NumberFormat('en-GB').format(1)`,
          `export const c = new Date().toLocaleString(undefined, { dateStyle: 'short' })`,
          `export const d = new Intl.PluralRules('hu').select(1)`,
        ].join('\n'),
      }),
    ).toEqual([])
  })

  it('finds nothing in the website, the administration, the Worker and the backend as they are, and has no exception that lacks a reason', () => {
    const root = process.cwd()
    expect(scanLocaleReferences([{ directory: SRC, base: SRC }, { directory: join(root, 'server', 'src'), base: root }, { directory: join(root, 'worker'), base: root }])).toEqual([])
    for (const [place, reason] of Object.entries(LOCALE_ALLOWED)) expect(reason.length, place).toBeGreaterThan(20)
  }, 60_000)
})

describe('sentences written into code (rule "literal")', () => {
  const folders: string[] = []
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
  })

  it('finds a sentence in a module and in a component’s logic, and passes names, ids, errors, imports and tri() texts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-literal-'))
    folders.push(dir)
    mkdirSync(join(dir, 'hooks'), { recursive: true })
    writeFileSync(
      join(dir, 'hooks', 'useThing.ts'),
      [
        `import { tri } from '../content/trilingual'`,
        `export const message = 'Something went wrong, please try again'`,
        `export const okay = tri('Minden rendben', 'All is well', 'Alles goed')`,
        `export const id = 'primary-navigation-menu'`,
        `export const code = 'react-router'`,
        `export function fail() { throw new Error('This should never happen at all') }`,
        `export const log = () => console.warn('A developer-only warning about the thing')`,
      ].join('\n'),
    )
    const found = scanLiterals(dir)
    expect(found.map((finding) => finding.sample)).toEqual(['Something went wrong, please try again'])
    expect(found[0].id).toBe('hooks/useThing.ts:2')
  })

  it('finds no such sentence in the website as it is (every exception is named, with its reason)', () => {
    expect(scanLiterals(SRC).map((finding) => `${finding.id}: ${finding.sample}`)).toEqual([])
  }, 60_000)
})

describe('the languages themselves', () => {
  it('are exactly Hungarian, English and Dutch, with the same ones in the checks', () => {
    expect([...LANGUAGES]).toEqual(['hu', 'en', 'nl'])
    const some: Language = 'hu'
    expect(LANGUAGES.includes(some)).toBe(true)
  })
})
