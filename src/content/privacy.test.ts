import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LANGUAGES } from '../i18n/config'
import { findPage } from '../routes/pages'
import { privacyMeta } from './privacyMeta'
import { privacyText, storedItems } from './privacy'

const SRC = join(process.cwd(), 'src')
function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}
const posix = (path: string) => relative(SRC, path).split(sep).join('/')

/**
 * Every source file that reads or writes the browser's storage. A new file that touches storage has to be
 * added here, which is the moment to add its item to content/privacy.ts and say what it keeps.
 */
const STORAGE_USERS = [
  'analytics/consent.ts',
  'components/intro/introPolicy.ts',
  'components/lab/artifacts/artifactDb.ts',
  'components/lab/core/useLabView.ts',
  'components/lab/experience/persist.ts',
  'motion/scrollRestoration.ts',
  'shop/cartStore.ts',
  'theme/theme.ts',
]

/** Where each stored item's name is written in the code (some files are handed a storage by another). */
const KEY_OWNERS: Record<string, string[]> = {
  'analytics/consent.ts': ['cc-consent-v1'],
  'components/intro/introPolicy.ts': ['intro:seen', 'intro:skip'],
  'components/lab/artifacts/artifactDb.ts': ['lab-artifacts'],
  'components/lab/core/labMode.ts': ['lab:view'],
  'components/lab/core/quality.ts': ['lab:quality'],
  'motion/scrollRestoration.ts': ['cc:scroll-positions'],
  'shop/cartStore.ts': ['cc-shop-cart-v1'],
  'theme/theme.ts': ['theme'],
}

describe('the privacy notice', () => {
  it('is a page in every language, with its own title and description', () => {
    expect(findPage('/privacy')?.languages).toEqual([...LANGUAGES])
    for (const lang of LANGUAGES) {
      expect(privacyMeta.title[lang].length).toBeGreaterThan(5)
      expect(privacyMeta.description[lang].length).toBeGreaterThan(60)
    }
  })

  it('lists every place the site touches browser storage, and every item it keeps', () => {
    const users = sources()
      .filter((file) => /\b(localStorage|sessionStorage|indexedDB)\b/.test(readFileSync(file, 'utf8')))
      .map(posix)
      // The sources whose only mention of storage is a comment or content about another project's code do not count.
      .filter((file) => !file.startsWith('content/projectDetails/') && file !== 'content/privacy.ts')
    expect(users.sort()).toEqual([...STORAGE_USERS].sort())

    const listed = new Set(storedItems.flatMap((item) => item.name.split(', ')))
    const claimed = new Set(Object.values(KEY_OWNERS).flat())
    expect([...claimed].sort()).toEqual([...listed].sort())
  })

  it('names each stored item exactly as the code writes it', () => {
    for (const [file, keys] of Object.entries(KEY_OWNERS)) {
      const text = readFileSync(join(SRC, file), 'utf8')
      for (const key of keys) expect(text, `${file} ${key}`).toContain(`'${key}'`)
    }
  })

  it('says, truthfully, that no cookie is set', () => {
    for (const file of sources()) expect(readFileSync(file, 'utf8'), posix(file)).not.toMatch(/document\.cookie|Set-Cookie/i)
    for (const lang of LANGUAGES) expect(privacyText.cookies.text[lang].length).toBeGreaterThan(10)
  })

  it('does not promise what only the owner can decide: no retention periods, legal bases, guarantees or named recipients', () => {
    const everything = JSON.stringify(privacyText) + JSON.stringify(storedItems)
    expect(everything).not.toMatch(/\b\d+\s*(days?|nap|dagen|months?|hónap|maanden|years?|év|jaar)\b/i)
    expect(everything).not.toMatch(/GDPR|AVG|legitimate interest|jogos érdek|gerechtvaardigd belang|guarantee|garan/i)
  })

  it('does not claim a measurement the site does not do', () => {
    // The notice has one wording for "no measurement" and a different one for "measurement on": the page picks by configuration.
    expect(privacyText.measurement.on.length).toBeGreaterThan(0)
    for (const lang of LANGUAGES) expect(privacyText.measurement.off[lang]).toMatch(/nem|not|geen/i)
  })
})
