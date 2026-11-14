import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_LANGUAGE, LANGUAGES } from '../src/config.ts'
import { formatMoney } from '../src/modules/quotes/money.ts'
import { parseDraft } from '../src/modules/quotes/quotations.ts'

/**
 * The places where the server and the website must agree about language (PROMPT 23). Each of these was found written twice
 * with nothing to keep the two copies equal, or with a default that was a guess.
 */

// The website's own module, loaded the way contract.test.ts loads the Worker's: the server never imports the website, only its tests do.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const website = (): Promise<{ DEFAULT_LANGUAGE: string; LANGUAGES: readonly string[]; LOCALE_TAGS: Record<string, string> }> => import(/* @vite-ignore */ pathToFileURL(join(root, 'src', 'i18n', 'config.ts')).href)

describe('what the server and the website share about languages', () => {
  it('know the same languages, in the same order', async () => {
    expect([...LANGUAGES]).toEqual([...(await website()).LANGUAGES])
  })

  it('have the same default language, the one of x-default, the root document and every visitor who cannot be placed', async () => {
    expect(DEFAULT_LANGUAGE).toBe((await website()).DEFAULT_LANGUAGE)
    expect(DEFAULT_LANGUAGE).toBe('en')
  })

  it('write an amount the way the website’s locale tags say (one tag per language, shared)', async () => {
    const { LOCALE_TAGS } = await website()
    for (const lang of LANGUAGES) {
      const expected = new Intl.NumberFormat(LOCALE_TAGS[lang], { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(1500.5)
      expect(formatMoney(150050, 'EUR', lang), lang).toBe(expected)
    }
  })
})

describe('a quotation draft keeps its language', () => {
  it('keeps the quotation’s own language when the body does not name one (it used to become English)', () => {
    for (const lang of LANGUAGES) expect(parseDraft({}, lang).language, lang).toBe(lang)
    expect(parseDraft({ language: '' }, 'nl').language).toBe('nl')
    expect(parseDraft({ language: null }, 'hu').language).toBe('hu')
  })

  it('takes the language the administrator names, and refuses one the site does not have', () => {
    expect(parseDraft({ language: 'en' }, 'hu').language).toBe('en')
    expect(() => parseDraft({ language: 'de' }, 'hu')).toThrow()
  })
})
