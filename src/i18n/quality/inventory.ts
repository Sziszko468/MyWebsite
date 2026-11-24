import { LANGUAGES } from '../config'
import { dictionaries } from '../dictionaries'
import type { Finding, Inventory, TextEntry } from './types'
import { walkTexts } from './walk'

/**
 * Every customer-facing text of the website, gathered from the places that hold them. Two kinds of source:
 *
 *   - the dictionaries (`i18n/locales/{hu,en,nl}.ts`): the chrome of the site (navigation, home, footer, forms and their errors…);
 *   - the content modules, whose texts are written next to each other with `tri(hu, en, nl)` (shop, services, quotes, the
 *     assistant, the privacy notice, the About page, the Lab, the projects).
 *
 * The list of files is explicit (a glob), so a new content file is a decision and not an accident; `inventory.test.ts` fails
 * when a source file that writes texts with `tri()` is not read here.
 */

// Loaded lazily and one by one: a module that fails to load is reported, and the rest are still checked.
const loaders = import.meta.glob<Record<string, unknown>>([
  // (PROMPT 30: content/ai/discovery.ts and content/ai/discoveryLabels.ts, the project discovery's words, are read through this pattern.)
  '../../content/**/*.ts',
  '!../../content/**/*.test.ts',
  // The seed exporters, the live overlay and the text-override store hold functions and stores, not texts.
  '!../../content/**/*Export.ts',
  '!../../content/liveCatalog.ts',
  '!../../content/catalogOverlay.ts',
  '!../../content/textOverrides.ts',
  '!../../content/textOverridesStore.ts',
  '!../../content/imageVariants.ts',
  // PROMPT 35: the interactive demos' words (content/demos/: shell, entry, meta and the three demos' own) are read through the content pattern above; the explicit entry keeps a new file from being missed.
  '../../content/demos/*.ts',
  // PROMPT 36: the Design System Playground's words (content/playground/: the page, the Lab's band, the head) are read through the content pattern above too; the explicit entry keeps a new file from being missed.
  '../../content/playground/*.ts',
  '../../seo/text.ts',
  '../../ai/availability.ts',
  '../../projects/static.ts',
  '../../components/**/*Text.ts',
  '../../components/lab/experiments/**/*Controls.ts',
  '../../components/lab/experiments/liquid/liquidMaterials.ts',
  '../../components/lab/experiments/generative/generativeControls.ts',
  // The eight sentences the "Example" button writes: plain {hu, en, nl} records, not tri().
  '../../components/lab/experiments/generative/examples.ts',
])

// The e-mails the server sends are written as word lists per language (some entries are functions that take a name or a
// reference). They are read here too: a function is called with named placeholders ({a0}, {a1}), so its sentence is compared
// like any other text, placeholders included.
const emailLoaders = import.meta.glob<Record<string, unknown>>([
  '../../../server/src/modules/notifications/templates.ts',
  '../../../server/src/modules/notifications/quoteTemplates.ts',
  // PROMPT 24: the consultation booking's e-mails and the suggested consultation types.
  '../../../server/src/modules/notifications/bookingTemplates.ts',
  // PROMPT 25: the client portal's e-mails.
  '../../../server/src/modules/notifications/clientTemplates.ts',
  // PROMPT 26: the project work's e-mails.
  '../../../server/src/modules/notifications/workTemplates.ts',
  // PROMPT 27: the feedback and approval e-mails.
  '../../../server/src/modules/notifications/deliverableTemplates.ts',
  // PROMPT 28: the client communication e-mails.
  '../../../server/src/modules/notifications/communicationTemplates.ts',
  '../../../server/src/modules/bookings/suggested.ts',
])

/** A word list with every function replaced by the sentence it makes from `{a0}`, `{a1}`… */
export function expandWords(value: unknown): unknown {
  if (typeof value === 'function') {
    const args = Array.from({ length: value.length }, (_, index) => `{a${index}}`)
    const made = (value as (...input: string[]) => unknown)(...args)
    return typeof made === 'string' ? made : undefined
  }
  if (Array.isArray(value)) return value.map(expandWords)
  if (typeof value === 'object' && value !== null) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, expandWords(item)]))
  return value
}

function areaOf(source: string): string {
  const parts = source.split('/')
  if (source.startsWith('server/')) return 'emails'
  if (source.startsWith('content/')) {
    const area = parts[1] ?? ''
    if (area.endsWith('.ts')) {
      if (area.startsWith('privacy')) return 'privacy'
      if (area.startsWith('lab')) return 'lab'
      if (area.startsWith('packages') || area.startsWith('pricing') || area.startsWith('offerings')) return 'services'
      return 'other'
    }
    if (area === 'projectDetails') return 'projects'
    return area
  }
  if (source.startsWith('i18n/')) return 'common'
  if (source.startsWith('components/lab/')) return 'lab'
  if (source.startsWith('seo/')) return 'seo'
  if (source.startsWith('projects/')) return 'projects'
  return 'other'
}

/** The path of a loader key (`../../content/shop/common.ts`) relative to `src/`. */
function sourceOf(key: string): string {
  return key.replace(/^(\.\.\/)+/, '')
}

export async function buildInventory(): Promise<Inventory> {
  const entries: TextEntry[] = []
  const findings: Finding[] = []
  const sources: string[] = []
  // One set for the whole run: an object that two modules both export is one text, listed under the first module that reached it.
  const seen = new WeakSet<object>()

  const add = (source: string, found: ReturnType<typeof walkTexts>) => {
    const area = areaOf(source)
    for (const entry of found.entries) entries.push({ ...entry, source, area })
    for (const finding of found.findings) findings.push({ ...finding, severity: 'error' })
  }

  // The dictionaries: one tree per language, joined by the path of each text.
  add('i18n/locales', walkTexts(dictionaries, 'dict', seen))
  sources.push('i18n/locales/hu.ts', 'i18n/locales/en.ts', 'i18n/locales/nl.ts')

  // The files that define texts come before the `index.ts` files that gather them.
  const isIndex = (key: string) => key.endsWith('/index.ts')
  const ordered = Object.entries(loaders).sort(([a], [b]) => Number(isIndex(a)) - Number(isIndex(b)) || a.localeCompare(b))
  for (const [key, load] of ordered) {
    const source = sourceOf(key)
    let module: Record<string, unknown>
    try {
      module = await load()
    } catch (error) {
      findings.push({ rule: 'load', severity: 'error', id: source, message: `could not be loaded: ${(error as Error).message}` })
      continue
    }
    sources.push(source)
    for (const [name, value] of Object.entries(module)) {
      if (typeof value === 'function') continue
      add(source, walkTexts(value, `${source}#${name}`, seen))
    }
  }

  for (const [key, load] of Object.entries(emailLoaders)) {
    const source = sourceOf(key)
    try {
      const module = await load()
      sources.push(source)
      for (const [name, value] of Object.entries(module)) {
        // `emailWords(lang)` and `quoteWords(lang)` are functions of the language; `CONFIRM` is the record itself.
        const record =
          typeof value === 'function' && /Words$/.test(name) ? Object.fromEntries(LANGUAGES.map((lang) => [lang, (value as (lang: string) => unknown)(lang)])) : name === 'CONFIRM' ? value : null
        if (record) add(source, walkTexts(expandWords(record), `${source}#${name}`, seen))
      }
    } catch (error) {
      findings.push({ rule: 'load', severity: 'error', id: source, message: `could not be loaded: ${(error as Error).message}` })
    }
  }
  return { entries, findings, sources }
}
