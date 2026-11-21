import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { demoEntry } from '../content/demos/entry'
import { demoMeta } from '../content/demos/meta'
import { demoKinds, demoText } from '../content/demos/shell'
import { financeText } from '../content/demos/finance'
import { bookingText } from '../content/demos/booking'
import { shipmentsText } from '../content/demos/shipments'
import { PROJECT_PAGES, PAGES, DEMO_PAGES, demoSlugOfPage, findPage, resolvePage } from '../routes/pages'
import { buildDocumentMeta } from '../routes/documentMeta'
import { LANGUAGES, type Language } from '../i18n/config'
import { I18nContext } from '../i18n/context'
import { dictionaries } from '../i18n/dictionaries'
import { flattenKinetic } from '../test/markup'
import { ThemeContext } from '../theme/context'
import { projectDetails } from '../content/projectDetails'
import { projects } from '../content/projects'
import { slugOf } from '../content/projectsExport'
import { staticRecord } from '../projects/static'
import { DemoShell } from './DemoShell'
import { DemoEntry } from './DemoEntry'
import BookingDemo from './booking/BookingDemo'
import FinanceDemo from './finance/FinanceDemo'
import ShipmentDemo from './shipments/ShipmentDemo'
import { DEMO_COMPONENTS, demoComponent } from './registry'
import { DEMO_PROJECTS, DEMO_SLUGS, DEMO_TYPES, INSTRUCTIONS_MAX, demoPath, demoTypesFor, isDemoType, isEligible, parseProjectDemo, type DemoType } from './ids'
import { missingFeatures, REQUIRED_FEATURES } from './support'

/**
 * Interactive demos (PROMPT 35): which projects have one, how a page reaches it, what the frame says, and the rules that keep a demo inside its page (no network,
 * no storage, no timers, nothing that outlives it). The models have their own test files beside them.
 */

const SRC = join(__dirname, '..')
const DEMOS = __dirname

function wrap(lang: Language, child: ReturnType<typeof createElement>) {
  return flattenKinetic(
    renderToStaticMarkup(
      createElement(
        ThemeContext.Provider,
        { value: { theme: 'dark', setTheme: () => undefined, toggleTheme: () => undefined, followSystem: () => undefined } },
        createElement(MemoryRouter, { initialEntries: [`/${lang}/work/spendly/demo`] }, createElement(I18nContext.Provider, { value: { lang, t: dictionaries[lang] } }, child)),
      ),
    ),
  )
}

const sources = (directory: string): Array<{ file: string; text: string }> =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|tsx|scss)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [{ file: relative(DEMOS, path).split(sep).join('/'), text: readFileSync(path, 'utf8') }] : []
  })

describe('which projects have a demo, and why', () => {
  it('registers exactly three types, each for the one real project whose own documentation describes the behaviour', () => {
    expect([...DEMO_TYPES]).toEqual(['finance-workbench', 'booking-flow', 'shipment-board'])
    expect(DEMO_PROJECTS).toEqual({ 'finance-workbench': ['spendly'], 'booking-flow': ['bookinghub'], 'shipment-board': ['logistics-platform'] })
    expect([...DEMO_SLUGS]).toEqual(['spendly', 'bookinghub', 'logistics-platform'])
  })

  it('only ever offers a demo to a project that exists in the portfolio with a page of its own', () => {
    const slugs = projects.filter((project) => project.detailPath !== null).map(slugOf)
    for (const slug of DEMO_SLUGS) expect(slugs, slug).toContain(slug)
    // The concept without a repository or a page has none.
    expect(demoTypesFor('hollandia')).toEqual([])
    expect(projects.find((project) => project.id === 'hollandia')?.detailPath).toBeNull()
  })

  it('ships the three projects with their demo switched on, and a project without a page with none', () => {
    for (const entry of projects) {
      const detail = projectDetails[entry.id]
      const slug = slugOf(entry)
      if (DEMO_SLUGS.includes(slug)) expect(parseProjectDemo(detail?.demo, slug), slug).not.toBeNull()
      else expect(detail?.demo ?? null, slug).toBeNull()
    }
    for (const slug of DEMO_SLUGS) expect(staticRecord(slug)?.detail.demo, slug).toMatchObject({ type: DEMO_TYPES.find((type) => isEligible(type, slug)) })
  })

  it('suits each demo to its project only: the other two projects get nothing from it', () => {
    for (const type of DEMO_TYPES) for (const slug of DEMO_SLUGS) expect(isEligible(type, slug), `${type} for ${slug}`).toBe(DEMO_PROJECTS[type].includes(slug))
    expect(parseProjectDemo({ type: 'booking-flow' }, 'spendly')).toBeNull()
  })
})

describe('reading a demo from data that came from elsewhere', () => {
  it('accepts a registered, eligible type with bounded plain-text instructions', () => {
    expect(parseProjectDemo({ type: 'finance-workbench' }, 'spendly')).toEqual({ type: 'finance-workbench', instructions: null })
    const long = 'x'.repeat(INSTRUCTIONS_MAX + 100)
    const read = parseProjectDemo({ type: 'booking-flow', instructions: { hu: ' Magyar ', en: long, nl: '' } }, 'bookinghub')
    expect(read?.instructions?.hu).toBe('Magyar')
    expect(read?.instructions?.en).toHaveLength(INSTRUCTIONS_MAX)
  })

  it('gives null for anything else, and never throws', () => {
    const bad: unknown[] = [null, undefined, 3, 'finance-workbench', [], {}, { type: 'nope' }, { type: 'constructor' }, { type: '__proto__' }, { type: ['finance-workbench'] }, { type: 'shipment-board' }]
    for (const value of bad) expect(parseProjectDemo(value, 'spendly'), JSON.stringify(value)).toBeNull()
    expect(parseProjectDemo({ type: 'finance-workbench', instructions: { hu: 5, en: {}, nl: null } }, 'spendly')?.instructions).toBeNull()
    expect(parseProjectDemo({ type: 'finance-workbench', instructions: 'text' }, 'spendly')?.instructions).toBeNull()
  })

  it('knows only its own type names', () => {
    for (const bad of ['', 'constructor', '__proto__', 'toString', 'finance-workbench ', null, 3]) expect(isDemoType(bad)).toBe(false)
  })
})

describe('the registry is a fixed table', () => {
  it('has a lazy component for every type and none for a name it does not own', () => {
    for (const type of DEMO_TYPES) expect(demoComponent(type), type).toBe(DEMO_COMPONENTS[type])
    for (const bad of ['', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'unknown', '../finance/FinanceDemo']) expect(demoComponent(bad), bad).toBeNull()
  })

  it('never loads code by a name that came from outside', () => {
    // Comments are not code: strip them before counting the imports.
    const registry = readFileSync(join(DEMOS, 'registry.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    // Each import is a literal path: no template string, no variable, no concatenation.
    const imports = [...registry.matchAll(/import\(([^)]*)\)/g)].map((match) => match[1].trim())
    expect(imports.length).toBe(DEMO_TYPES.length)
    for (const spec of imports) expect(spec, spec).toMatch(/^'\.\/[a-z]+\/[A-Za-z]+'$/)
    for (const { file, text: raw } of sources(DEMOS)) {
      const text = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(text, file).not.toMatch(/\beval\s*\(|new Function\s*\(|dangerouslySetInnerHTML|\.innerHTML\s*=|document\.write|import\s*\(\s*[^'")\s]/)
    }
  })
})

describe('the demo pages: routes, search engines and the head', () => {
  it('has a page for each of the three projects, in every language, never indexed', () => {
    expect(DEMO_PAGES.map((page) => page.path)).toEqual(['/work/spendly/demo', '/work/bookinghub/demo', '/work/logistics-platform/demo'])
    for (const page of DEMO_PAGES) {
      expect(page.indexable, page.path).toBe(false)
      expect([...page.languages], page.path).toEqual([...LANGUAGES])
      expect(PAGES).toContain(page)
      expect(demoSlugOfPage(page.id)).toBe(page.path.split('/')[2])
    }
  })

  it('leaves every project page as it was: still indexable, same paths, same ids', () => {
    expect(PROJECT_PAGES.map((page) => [page.id, page.path, page.indexable])).toEqual([
      ['project-spendly', '/work/spendly', true],
      ['project-bookinghub', '/work/bookinghub', true],
      ['project-logistics', '/work/logistics-platform', true],
    ])
    expect(DEMO_PAGES.some((page) => PROJECT_PAGES.some((project) => project.path === page.path))).toBe(false)
  })

  it('resolves a demo address for any slug (the page itself says "not found" when the project has no demo), never indexed, never a preview', () => {
    const page = resolvePage('/work/some-new-project/demo')
    expect(page?.id).toBe('demo-some-new-project')
    expect(page?.indexable).toBe(false)
    expect(resolvePage('/work/some-new-project/demo/')).toBe(page)
    expect(findPage('/work/spendly/demo')?.id).toBe('demo-spendly')
    for (const path of ['/work/preview/demo', '/work/a/demo/extra', '/work/UPPER/demo', '/work/x/demo?x=1', '/work//demo', '/work/x/demos']) expect(resolvePage(path), path).toBeUndefined()
  })

  it('titles a demo page by the project and the demo, and describes what the demo is, in each language', () => {
    for (const lang of LANGUAGES) {
      const page = findPage('/work/spendly/demo')
      const meta = buildDocumentMeta(page, lang, dictionaries[lang], 'Brand')
      expect(meta.title, lang).toBe(`${demoMeta.title[lang].replace('{name}', 'Spendly')} — Brand`)
      expect(meta.description, lang).toBe(demoMeta.descriptions['finance-workbench'][lang])
      expect(meta.ogType).toBe('website')
    }
  })
})

describe('what the frame says, in every language', () => {
  const projectName = 'Spendly'
  // The shell checks the browser before it draws a demo; the test runs in Node, so it is given the two browser functions it asks for.
  beforeAll(() => {
    vi.stubGlobal('requestAnimationFrame', () => 0)
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
  })
  afterAll(() => vi.unstubAllGlobals())

  it.each(LANGUAGES)('%s: the way back, the three labels, the instructions, the account of real and simulated, restart and full screen', (lang) => {
    for (const type of DEMO_TYPES) {
      const html = wrap(lang, createElement(DemoShell, { type, slug: 'spendly', projectName, instructions: null }))
      expect(html, `${lang} ${type}`).toContain(`href="/${lang}/work/spendly"`)
      expect(html).toContain(demoText.labels.interactive[lang])
      expect(html).toContain(demoText.labels.simulated[lang])
      expect(html).toContain(demoText.labels.notSaved[lang])
      expect(html).toContain(demoKinds[type].instructions[lang])
      for (const line of [...demoKinds[type].real, ...demoKinds[type].simulated]) expect(html).toContain(line[lang].replace(/&/g, '&amp;'))
      expect(html).toContain(demoText.frame.restart[lang])
      expect(html).toContain(`aria-label="${demoText.frame.fullscreen[lang]}"`)
      expect(html).toContain('data-demo-stage')
      expect(html).toMatch(/<h1[^>]*>[^<]*Spendly/)
      expect(html.match(/<h1/g)).toHaveLength(1)
    }
  })

  it('shows the owner’s instructions as text, after the built-in ones, and never as markup', () => {
    const hostile = '<img src=x onerror=alert(1)><script>alert(2)</script>'
    const html = wrap('en', createElement(DemoShell, { type: 'finance-workbench', slug: 'spendly', projectName, instructions: { hu: '', en: hostile, nl: '' } }))
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('<script>alert')
    // A language without instructions shows only the built-in ones.
    const hu = wrap('hu', createElement(DemoShell, { type: 'finance-workbench', slug: 'spendly', projectName, instructions: { hu: '', en: hostile, nl: '' } }))
    expect(hu).not.toContain('onerror')
  })

  it('draws the entry on a project’s page with a way in, an honest line, and no price, claim or metric', () => {
    for (const lang of LANGUAGES) {
      for (const type of DEMO_TYPES) {
        const html = wrap(lang, createElement(DemoEntry, { slug: 'spendly', demo: { type, instructions: null } }))
        expect(html).toContain(`href="/${lang}/work/spendly/demo"`)
        expect(html).toContain(demoEntry.entry.kicker[lang])
        expect(html).toContain(demoEntry.entry.note[lang])
        expect(html).toContain(demoEntry.kinds[type].name[lang])
        expect(html).toContain(demoEntry.kinds[type].summary[lang])
        expect(html).toContain('id="demo"')
      }
    }
  })

  it('says plainly when the browser cannot run a demo', () => {
    expect(missingFeatures({})).toEqual([...REQUIRED_FEATURES])
    expect(missingFeatures({ Intl: { DateTimeFormat() {}, NumberFormat() {} }, Array: { prototype: { at() {} } }, requestAnimationFrame() {}, matchMedia() {} })).toEqual([])
    expect(missingFeatures({ Intl: { DateTimeFormat() {} }, Array: { prototype: { at() {} } }, requestAnimationFrame() {}, matchMedia() {} })).toEqual(['Intl.NumberFormat'])
    for (const lang of LANGUAGES) {
      expect(demoText.states.unsupportedTitle[lang].length).toBeGreaterThan(8)
      expect(demoText.states.errorTitle[lang].length).toBeGreaterThan(8)
      expect(demoText.states.loading[lang].length).toBeGreaterThan(8)
    }
  })

  it('has a failure state that offers a retry and the way back, and a boundary that catches a demo that throws', () => {
    const shell = readFileSync(join(DEMOS, 'DemoShell.tsx'), 'utf8')
    expect(shell).toContain('getDerivedStateFromError')
    expect(shell).toContain('text.states.retry')
    expect(shell).toContain('<Suspense')
    expect(shell).toMatch(/<DemoBoundary\s+key=\{`\$\{restart\}-\$\{lang\}`\}/)
  })
})

describe('every demo draws, in every language, with labelled controls and no raw keys', () => {
  const demos: Array<[string, ComponentType]> = [
    ['finance-workbench', FinanceDemo],
    ['booking-flow', BookingDemo],
    ['shipment-board', ShipmentDemo],
  ]

  it.each(demos)('%s', (_name, Demo) => {
    for (const lang of LANGUAGES) {
      const html = wrap(lang, createElement(Demo))
      expect(html, lang).not.toMatch(/undefined|\[object|\{\w+\}|NaN/)
      // Every field has a label (or a name of its own): a control a screen reader cannot name is a defect.
      const controls = [...html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)].filter((match) => !/type="(hidden)"/.test(match[2]))
      expect(controls.length, lang).toBeGreaterThan(0)
      for (const [, tag, attributes] of controls) {
        const id = /\bid="([^"]+)"/.exec(attributes)?.[1]
        const labelled = /aria-label="[^"]+"/.test(attributes) || (id !== undefined && new RegExp(`<label[^>]*\\bfor="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(html)) || /<label[^>]*>(?:(?!<\/label>).)*<input[^>]*type="radio"/s.test(html)
        expect(labelled, `${lang} ${tag} ${attributes.slice(0, 80)}`).toBe(true)
      }
      // Every button says something and is a real button; nothing clickable is a div.
      for (const [, attributes, inner] of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
        expect(/type="(button|submit)"/.test(attributes), `${lang} button type`).toBe(true)
        expect(inner.replace(/<[^>]+>/g, '').trim().length > 0 || /aria-label="[^"]+"/.test(attributes), `${lang} button without a name`).toBe(true)
      }
      expect(html).not.toMatch(/<div[^>]*onClick|role="button"/)
    }
  })

  it('says it is sample data on the surfaces that show figures or records', () => {
    for (const lang of LANGUAGES) {
      expect(wrap(lang, createElement(FinanceDemo))).toContain(demoText.labels.sample[lang])
      expect(wrap(lang, createElement(BookingDemo))).toContain(demoText.labels.sample[lang])
      expect(wrap(lang, createElement(ShipmentDemo))).toContain(shipmentsText.sample[lang])
    }
  })
})

describe('the demos’ words', () => {
  const tables: Record<string, unknown> = { demoText, demoKinds, demoEntry, demoMeta, financeText, bookingText, shipmentsText }
  const triples = (value: unknown, path: string, found: Array<[string, Record<string, string>]> = []) => {
    if (typeof value !== 'object' || value === null) return found
    const record = value as Record<string, unknown>
    if (typeof record.hu === 'string' && typeof record.en === 'string' && typeof record.nl === 'string') {
      found.push([path, record as Record<string, string>])
      return found
    }
    for (const [key, child] of Object.entries(record)) triples(child, `${path}.${key}`, found)
    return found
  }
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

  for (const [name, table] of Object.entries(tables)) {
    it(`${name}: every text is in every language, none empty, and the languages ask for the same values`, () => {
      const found = triples(table, name)
      expect(found.length).toBeGreaterThan(2)
      for (const [path, text] of found) {
        for (const lang of LANGUAGES) expect(text[lang].trim().length, `${path} ${lang}`).toBeGreaterThan(0)
        expect(placeholders(text.hu), path).toEqual(placeholders(text.en))
        expect(placeholders(text.nl), path).toEqual(placeholders(text.en))
      }
    })
  }

  it('never says anything that is not true of a demo: no claim of a real booking, payment, email, customer, result or metric', () => {
    const everything = JSON.stringify([demoText, demoKinds, demoEntry, financeText, bookingText, shipmentsText])
    // A "confirmation" in the booking demo is always said to be a demo, and the shell never says "live".
    for (const lang of LANGUAGES) {
      expect(bookingText.summary.banner[lang].length).toBeGreaterThan(20)
      expect(demoKinds['booking-flow'].simulated.some((line) => /e-?mail/i.test(line[lang]))).toBe(true)
    }
    expect(everything).not.toMatch(/\bproduction\b|\bguarantee|testimonial|\b\d+\s*% (faster|growth|increase)/i)
  })
})

describe('a demo stays inside its page', () => {
  const FORBIDDEN: Array<[string, RegExp]> = [
    ['a network call', /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|navigator\.serviceWorker/],
    ['storage or cookies', /localStorage|sessionStorage|indexedDB|document\.cookie|caches\./],
    ['a timer or a worker', /\bsetInterval\s*\(|\bsetTimeout\s*\(|new Worker|new SharedWorker|requestIdleCallback/],
    ['a global listener or an observer', /addEventListener|new (IntersectionObserver|ResizeObserver|MutationObserver)|window\.|document\./],
    ['the analytics', /analytics\/|track\(/],
    ['the backend or a secret', /config\/api|API_BASE|import\.meta\.env|process\.env/],
    ['a link out', /target="_blank"|window\.open|location\./],
  ]

  it('has none of: a network call, storage, a timer, a global listener, the analytics, the backend, or a link out', () => {
    for (const { file, text } of sources(DEMOS).filter((source) => !source.file.endsWith('.scss'))) {
      // The shell is the one place that is allowed to touch `document` (it is the Lab's full-screen controller that does, through its hook); a demo itself is not.
      if (file === 'DemoShell.tsx' || file === 'DemoPage.tsx' || file === 'support.ts') continue
      for (const [what, pattern] of FORBIDDEN) {
        // `requestAnimationFrame` is allowed for one thing: sending focus to the first invalid field after a submit. It is one-shot and reads a ref that is null after unmount.
        const stripped = text.replace(/requestAnimationFrame\(\(\) => [a-zA-Z.]*Ref\.current\?\.querySelector<HTMLElement>\(FIRST_INVALID\)\?\.focus\(\)\)/g, '')
        expect(pattern.test(stripped), `${file} has ${what}`).toBe(false)
      }
    }
  })

  it('keeps every animation behind the reduced-motion query, so under reduced motion nothing moves', () => {
    /** Whether the character at `index` is inside a block whose header is the no-preference reduced-motion query. */
    const insideQuery = (text: string, index: number): boolean => {
      const stack: boolean[] = []
      let header = ''
      for (let i = 0; i < index; i += 1) {
        const char = text[i]
        if (char === '{') {
          stack.push(/@media[^{]*prefers-reduced-motion:\s*no-preference/.test(header))
          header = ''
        } else if (char === '}') {
          stack.pop()
          header = ''
        } else if (char === ';') header = ''
        else header += char
      }
      return stack.some(Boolean)
    }
    let seen = 0
    for (const { file, text } of sources(DEMOS).filter((source) => source.file.endsWith('.scss'))) {
      for (const match of text.matchAll(/\b(transition|animation|animation-name|scroll-behavior)\s*:/g)) {
        seen += 1
        expect(insideQuery(text, match.index ?? 0), `${file}: ${text.slice(match.index, (match.index ?? 0) + 50)}`).toBe(true)
      }
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('writes no state outside the component: no module-level mutable store, no global, and every restart builds a fresh state', () => {
    for (const { file, text } of sources(DEMOS).filter((source) => /model\.ts$/.test(source.file))) {
      expect(text, file).not.toMatch(/^(let|var) /m)
    }
  })
})

describe('the entry on a project’s page is the only change to it', () => {
  it('passes the project’s demo through the same reader as every other source, and draws the entry outside the numbered bands', () => {
    const page = readFileSync(join(SRC, 'pages', 'ProjectPage.tsx'), 'utf8')
    expect(page).toContain('parseProjectDemo(detail.demo, card.slug)')
    expect(page).toContain('{demo && !record.preview && card.detailPath !== null && <DemoEntry slug={card.slug} demo={demo} />}')
    // The numbered bands are the same list, in the same order, as before.
    expect(page).toContain("hasOverview && { id: 'overview'")
    expect(page).toContain("hasLinks && { id: 'links'")
  })

  it('is registered as a chunk of its own: the project page does not pay for a demo’s code', () => {
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8')
    expect(app).toContain("const DemoRoute = lazyRoute(() => import('./demos/DemoPage')")
    const entry = readFileSync(join(DEMOS, 'DemoEntry.tsx'), 'utf8')
    expect(entry).not.toMatch(/registry|FinanceDemo|BookingDemo|ShipmentDemo/)
  })
})

describe('demo types and routes agree', () => {
  it('has a demo page path for every project slug that has a type, and the type map is total', () => {
    for (const slug of DEMO_SLUGS) expect(demoPath(slug)).toBe(`/work/${slug}/demo`)
    const all: DemoType[] = [...DEMO_TYPES]
    expect(all.every((type) => demoComponent(type) !== null)).toBe(true)
  })
})
