import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseContent, parseExtra, parsePackage, parseService } from '../src/modules/catalog/admin.ts'
import { FIELDS } from '../src/modules/catalog/translations.ts'
import { HttpError } from '../src/http/errors.ts'
import { LANGUAGES } from '../src/config.ts'

/**
 * The administration's editors (src/admin/lib/catalog.ts) count characters and mark required fields from their own
 * lists. The server is the authority: these tests hold the two together, so a limit changed on one side without the
 * other fails here instead of surprising an administrator at the save button.
 */

interface FieldSpec {
  name: string
  kind: 'line' | 'block' | 'list'
  max: number
  required?: boolean
}

// The administration's file is loaded by path at run time: it belongs to the other TypeScript project (as in contract.test.ts).
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = (path: string): Promise<any> => import(/* @vite-ignore */ pathToFileURL(join(root, path)).href)
const catalog = await load('src/admin/lib/catalog.ts')
const SERVICE_FIELDS = catalog.SERVICE_FIELDS as readonly FieldSpec[]
const PACKAGE_FIELDS = catalog.PACKAGE_FIELDS as readonly FieldSpec[]
const EXTRA_FIELDS = catalog.EXTRA_FIELDS as readonly FieldSpec[]
const FAQ_FIELDS = catalog.FAQ_FIELDS as readonly FieldSpec[]
const FAQ_LABELS = catalog.FAQ_LABELS as Record<string, string>

const spaFor = { services: SERVICE_FIELDS, packages: PACKAGE_FIELDS, extras: EXTRA_FIELDS } as const

describe('the translation screen’s fields are the editors’ fields', () => {
  it.each(Object.entries(spaFor))('%s: same names, kinds, limits and required flags, in the same order', (group, fields) => {
    expect(FIELDS[group as keyof typeof spaFor].map((f) => ({ name: f.name, kind: f.kind, max: f.max, required: Boolean(f.required) }))).toEqual(fields.map((f) => ({ name: f.name, kind: f.kind, max: f.max, required: Boolean(f.required) })))
  })

  it('the FAQ is stored as a title and a description and edited as a question and an answer: same kinds and limits', () => {
    const server = FIELDS.faq.map((f) => ({ name: f.name, kind: f.kind, max: f.max, required: Boolean(f.required) }))
    const editor = FAQ_FIELDS.map((f) => ({ name: FAQ_LABELS[f.name], kind: f.kind, max: f.max, required: Boolean(f.required) }))
    expect(editor).toEqual(server)
  })
})

/** A valid save for one kind of record, built from the editors' field lists, with `override` applied to one field. */
function body(group: 'services' | 'packages' | 'extras' | 'faq', override?: { language: string; field: string; value: string | string[] }) {
  const fields = group === 'faq' ? FAQ_FIELDS : spaFor[group]
  const translations = Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      Object.fromEntries(
        fields.map((f) => {
          const value = override && override.language === language && override.field === f.name ? override.value : f.kind === 'list' ? ['ok'] : 'ok'
          return [f.name, value]
        }),
      ),
    ]),
  )
  const base = { status: 'active', position: 0, translations }
  if (group === 'services') return { ...base, slug: 'test-service', category: 'web', packages: [] }
  if (group === 'packages') return { ...base, code: 'test-package', price: { kind: 'quote' }, extras: [], needs: [] }
  if (group === 'extras') return { ...base, code: 'test-extra', price: { kind: 'quote' }, appliesTo: [] }
  return { ...base, type: 'faq', slug: 'test-faq' }
}

const parse = (group: 'services' | 'packages' | 'extras' | 'faq', input: ReturnType<typeof body>) => (group === 'services' ? parseService(input) : group === 'packages' ? parsePackage(input) : group === 'extras' ? parseExtra(input) : parseContent(input))

const failure = (work: () => unknown): Record<string, string> => {
  try {
    work()
  } catch (error) {
    if (error instanceof HttpError) return ((error.details as { fields?: Record<string, string> } | undefined)?.fields ?? {}) as Record<string, string>
    throw error
  }
  return {}
}

const cases = ([['services', SERVICE_FIELDS], ['packages', PACKAGE_FIELDS], ['extras', EXTRA_FIELDS], ['faq', FAQ_FIELDS]] as const).flatMap(([group, fields]) => fields.map((field) => [group, field] as [typeof group, FieldSpec]))

describe('what the editors let through, the save accepts; what they warn about, it refuses', () => {
  it('a valid save is accepted (so the cases below fail for the one field they change)', () => {
    for (const group of ['services', 'packages', 'extras', 'faq'] as const) expect(() => parse(group, body(group))).not.toThrow()
  })

  it.each(cases)('%s.%s: exactly its limit is accepted, one more is “tooLong”', (group, field) => {
    const make = (length: number) => (field.kind === 'list' ? ['a'.repeat(length)] : 'a'.repeat(length))
    expect(() => parse(group, body(group, { language: 'hu', field: field.name, value: make(field.max) }))).not.toThrow()
    expect(failure(() => parse(group, body(group, { language: 'hu', field: field.name, value: make(field.max + 1) })))).toEqual({ [`translations.hu.${field.name}`]: 'tooLong' })
  })

  it.each(cases.filter(([, field]) => field.required))('%s.%s: required, in every language', (group, field) => {
    for (const language of LANGUAGES) {
      expect(failure(() => parse(group, body(group, { language, field: field.name, value: '' })))).toEqual({ [`translations.${language}.${field.name}`]: 'required' })
    }
  })

  it.each(cases.filter(([, field]) => !field.required && field.kind !== 'list'))('%s.%s: not required, an empty value is fine', (group, field) => {
    expect(() => parse(group, body(group, { language: 'nl', field: field.name, value: '' }))).not.toThrow()
  })
})

describe("the project editor's rules are the server's rules", () => {
  it('has the same limits, the same choices, and the same verdict per language on the same documents', async () => {
    const editor = await load('src/admin/lib/projects.ts')
    const server = await import('../src/modules/projects/content.ts')
    expect(editor.LIMITS).toEqual({ title: server.LIMITS.title, line: server.LIMITS.line, card: server.LIMITS.card, summary: server.LIMITS.card * 2, paragraph: server.LIMITS.paragraph, item: server.LIMITS.item, source: server.LIMITS.source, tag: server.LIMITS.tag, list: server.LIMITS.list, gallery: server.LIMITS.gallery, challenges: server.LIMITS.challenges })
    expect([...editor.ACCENTS]).toEqual([...server.ACCENTS])
    expect([...editor.HEROES]).toEqual([...server.HEROES])
    expect([...editor.MOCKUPS]).toEqual([...server.MOCKUPS])
    expect([...editor.LAYOUTS]).toEqual([...server.LAYOUTS])
    expect([...editor.PROJECT_STATUSES]).toEqual([...server.PROJECT_STATUSES])
    expect([...editor.STACK_GROUPS]).toEqual([...server.STACK_GROUPS])
    expect([...editor.FEATURE_STATUSES]).toEqual([...server.FEATURE_STATUSES])
    expect([...editor.SECTIONS]).toEqual([...server.SECTIONS])

    // The same documents, judged by both: a fresh one, a half-written one, a hidden section, a gallery without descriptions.
    const tri = (hu: string, en = '', nl = '') => ({ hu, en, nl })
    const documents: unknown[] = [
      editor.emptyContent(),
      { ...editor.emptyContent(), title: tri('Cím', 'Title'), summary: tri('Összefoglaló', 'Summary', 'Samenvatting'), cardDescription: tri('Kártya', 'Card', 'Kaart') },
      { ...editor.emptyContent(), title: tri('A', 'B', 'C'), cardDescription: tri('A', 'B', 'C'), summary: tri('A', 'B', 'C'), overview: { ...editor.emptyContent().overview, what: tri('Mi', 'What', '') }, hidden: ['overview'], learned: [tri('Csak magyar')] },
      { ...editor.emptyContent(), title: tri('A', 'B', 'C'), cardDescription: tri('A', 'B', 'C'), summary: tri('A', 'B', 'C'), thumbnail: { mediaId: 1, alt: tri('Alt', '', 'Alt') }, gallery: [{ mediaId: 2, device: 'desktop', alt: tri('Alt'), caption: tri(''), hero: true }], detailPage: false },
    ]
    for (const [index, document] of documents.entries()) {
      const { content } = server.normalizeContent(document)
      expect(editor.completenessOf(content), `document ${index}`).toEqual(server.completeness(content))
    }
  })
})
