import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { QuotationView } from '../api/types'
import { en } from '../i18n/en'
import { hu } from '../i18n/hu'
import { QuotationPreview } from './QuotationPage'

/** The preview in the quotation editor: the saved document as the customer will read it. The words and amounts are the server's; this only lays them out. */

const money = (minor: number, text: string) => ({ minor, text })
const view = (over: Partial<QuotationView> = {}): QuotationView => ({
  reference: 'CC-2026-000001-Q1',
  requestReference: 'CC-2026-000001',
  version: 1,
  language: 'hu',
  status: 'draft',
  expired: false,
  title: 'Egy weboldal a pékségnek',
  introduction: '',
  understanding: '',
  scope: 'Öt oldal és egy űrlap.\nMásodik sor.',
  deliverables: '',
  exclusions: '',
  paymentTerms: 'Három részletben.',
  terms: 'A feltételek.',
  notes: '',
  estimatedTimeline: '',
  customer: { name: 'Anna Visser', company: 'Visser Bakery' },
  validUntil: '2026-12-31',
  pricing: {
    mode: 'itemized',
    note: '',
    currency: 'EUR',
    lines: [
      { kind: 'item', description: 'Tervezés', detail: 'Három kör.', quantity: 1, unit: money(150050, '1500,50 EUR'), total: money(150050, '1500,50 EUR'), justification: '' },
      { kind: 'item', description: 'Építés', detail: '', quantity: 2, unit: money(80000, '800,00 EUR'), total: money(160000, '1600,00 EUR'), justification: '' },
      { kind: 'optional', description: 'Tárhely beállítása', detail: '', quantity: 1, unit: money(20000, '200,00 EUR'), total: money(20000, '200,00 EUR'), justification: '' },
      { kind: 'discount', description: 'Korai foglalás', detail: '', quantity: 1, unit: money(10000, '100,00 EUR'), total: money(10000, '100,00 EUR'), justification: 'Telefonon megbeszéltük.' },
    ],
    fixed: null,
    subtotal: money(310050, '3100,50 EUR'),
    discount: money(10000, '100,00 EUR'),
    optional: money(20000, '200,00 EUR'),
    tax: { mode: 'excluded', ratePercent: '27', amount: money(81013, '810,13 EUR'), verified: true, note: 'Az áfa külön sor.' },
    total: money(381063, '3810,63 EUR'),
  },
  ...over,
})
const render = (v: QuotationView, words = en.quotation.editor) => renderToStaticMarkup(h(QuotationPreview, { view: v, e: words, noValue: '—' }))

describe('the quotation preview', () => {
  it('lays out what the server built: the title, who it is for, the last day, the text, the lines, the discount with its reason, the tax and the total', () => {
    const html = render(view())
    for (const part of ['Egy weboldal a pékségnek', 'For Anna Visser (Visser Bakery)', 'Valid until 2026-12-31', 'Öt oldal és egy űrlap.', 'Tervezés', '1500,50 EUR', 'Három kör.', 'Építés', '2 × 800,00 EUR', 'Korai foglalás', 'Reason: Telefonon megbeszéltük.', 'VAT (27 %)', '810,13 EUR', 'Az áfa külön sor.', '3810,63 EUR', 'Három részletben.', 'A feltételek.']) expect(html, part).toContain(part)
    // The optional line is shown apart and is not in the total's block; empty sections leave no empty heading.
    expect(html).toContain(en.quotation.editor.kinds.optional)
    expect(html).toContain('Tárhely beállítása')
    expect(html).not.toContain(en.quotation.editor.introduction)
    expect(html).not.toContain(en.quotation.editor.exclusions)
  })

  it('says which language the document is in, so that a screen reader reads it in that language', () => {
    expect(render(view({ language: 'hu' }))).toContain('lang="hu"')
    expect(render(view({ language: 'nl' }))).toContain('lang="nl"')
  })

  it('shows what a person typed as text, never as markup', () => {
    const html = render(view({ scope: '<script>alert(1)</script> <b>bold</b>', title: '<img src=x onerror=alert(1)>' }))
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<b>bold</b>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('writes a fixed price as one amount and a custom price as the words the administrator wrote, and never invents a figure', () => {
    const fixed = render(view({ pricing: { ...view().pricing, mode: 'fixed', lines: [], fixed: money(250000, '2500,00 EUR'), subtotal: null, discount: null, optional: null, total: money(250000, '2500,00 EUR'), tax: { mode: 'unspecified', ratePercent: null, amount: null, verified: false, note: '' } } }))
    expect(fixed).toContain('2500,00 EUR')
    expect(fixed).not.toContain(en.quotation.editor.total)
    const custom = render(view({ pricing: { ...view().pricing, mode: 'custom', note: 'Óradíj: 60 euró.', lines: [], fixed: null, subtotal: null, discount: null, optional: null, total: null, tax: { mode: 'unspecified', ratePercent: null, amount: null, verified: false, note: '' }, currency: null } }))
    expect(custom).toContain('Óradíj: 60 euró.')
    expect(custom).not.toMatch(/EUR|HUF/)
    const empty = render(view({ pricing: { ...view().pricing, mode: 'custom', note: '', lines: [], fixed: null, subtotal: null, discount: null, optional: null, total: null, currency: null } }))
    expect(empty).toContain(en.quotation.editor.preview.notStated)
  })

  it('says no VAT figure when none was confirmed, and has the same sections in Hungarian', () => {
    const noTax = render(view({ pricing: { ...view().pricing, tax: { mode: 'excluded', ratePercent: null, amount: null, verified: false, note: '' } } }))
    expect(noTax).not.toContain('VAT (')
    const hungarian = render(view(), hu.quotation.editor)
    expect(hungarian).toContain(hu.quotation.editor.sections.price)
    expect(hungarian).toContain(hu.quotation.editor.paymentTerms)
    expect(hungarian).toContain(`${hu.quotation.editor.total}`)
  })
})
