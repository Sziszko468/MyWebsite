import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { experiments, playableExperiments } from '../content/lab'
import { playgroundEntry } from '../content/playground/entry'
import { playgroundMeta } from '../content/playground/meta'
import { playgroundText } from '../content/playground/text'
import { LANGUAGES, type Language } from '../i18n/config'
import { I18nContext } from '../i18n/context'
import { dictionaries } from '../i18n/dictionaries'
import { buildDocumentMeta } from '../routes/documentMeta'
import { LAB_PAGES, PAGES, PLAYGROUND_PAGES, findPage, labIdOfPage, resolvePage } from '../routes/pages'
import { scopeOfPage } from '../motion/config'
import { flattenKinetic } from '../test/markup'
import { ThemeContext } from '../theme/context'
import { localize } from '../content/trilingual'
import { DesignPlaygroundPage } from '../pages/DesignPlaygroundPage'
import { ColorLab } from './ColorLab'
import { ComponentLab } from './ComponentLab'
import { LayoutLab } from './LayoutLab'
import { MotionLab } from './MotionLab'
import { PreviewStage } from './PreviewStage'
import { TypeLab } from './TypeLab'
import { BRAND_IDS } from './color'
import { initialState, originalComponents, COMPONENT_IDS, type ComponentId } from './state'

/**
 * The Design System Playground (PROMPT 36): how the page is registered, what it says in every language, the real components it shows, and the rules that keep every change
 * a visitor makes inside the page (no storage, no network, no write to the site's theme, no timer or listener without a way out). The pure rules have their own tests in model.test.ts.
 */

const HERE = __dirname
const SRC = join(__dirname, '..')

function wrap(lang: Language, child: ReturnType<typeof createElement>, theme: 'dark' | 'light' = 'dark') {
  return flattenKinetic(
    renderToStaticMarkup(
      createElement(
        ThemeContext.Provider,
        { value: { theme, setTheme: () => undefined, toggleTheme: () => undefined, followSystem: () => undefined } },
        createElement(MemoryRouter, { initialEntries: [`/${lang}/lab/design-system`] }, createElement(I18nContext.Provider, { value: { lang, t: dictionaries[lang] } }, child)),
      ),
    ),
  )
}

const sources = (directory: string): Array<{ file: string; text: string }> =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|tsx|scss)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [{ file: relative(HERE, path).split(sep).join('/'), text: readFileSync(path, 'utf8') }] : []
  })

const own = sources(HERE)

describe('how the playground is registered', () => {
  it('is one page at /lab/design-system, in every language, indexable, and not an experiment', () => {
    expect(PLAYGROUND_PAGES).toHaveLength(1)
    const page = PLAYGROUND_PAGES[0]
    expect(page.path).toBe('/lab/design-system')
    expect(page.indexable).toBe(true)
    expect(page.languages).toEqual(LANGUAGES)
    expect(findPage('/lab/design-system')).toBe(page)
    expect(resolvePage('/lab/design-system/')).toBe(page)
    expect(PAGES).toContain(page)
  })

  it('is not a seventh experience: the Lab still has exactly six, and the playground is in none of their lists', () => {
    expect(experiments).toHaveLength(6)
    expect(playableExperiments).toHaveLength(6)
    expect(experiments.map((experiment) => experiment.id)).not.toContain('design-system')
    expect(LAB_PAGES.map((entry) => entry.path)).not.toContain('/lab/design-system')
    expect(LAB_PAGES).toHaveLength(6)
    // Its id does not start with `lab-`, so nothing that takes a `lab-…` id for an experiment's page takes it for one.
    expect(PLAYGROUND_PAGES[0].id.startsWith('lab-')).toBe(false)
    expect(labIdOfPage(PLAYGROUND_PAGES[0].id)).toBeNull()
  })

  it('plays under the Lab’s motion scope, and the main code knows nothing else about it but the head', () => {
    expect(scopeOfPage('design-playground')).toBe('lab')
    expect(scopeOfPage('lab')).toBe('lab')
  })

  it('has a title and a description of its own in every language, and the title carries the Lab and the brand', () => {
    for (const lang of LANGUAGES) {
      const meta = buildDocumentMeta(PLAYGROUND_PAGES[0], lang, dictionaries[lang], 'Brand')
      expect(meta.title, lang).toContain(playgroundMeta.title[lang])
      expect(meta.title, lang).toContain(dictionaries[lang].nav.lab)
      expect(meta.description, lang).toBe(playgroundMeta.description[lang])
      expect(meta.description.length, lang).toBeGreaterThan(80)
    }
    const titles = new Set(LANGUAGES.map((lang) => buildDocumentMeta(PLAYGROUND_PAGES[0], lang, dictionaries[lang], 'Brand').description))
    expect(titles.size).toBe(3)
  })

  it('is linked from the Lab by a band of its own, not from the list of experiences', () => {
    const lab = readFileSync(join(SRC, 'pages/LabPage.tsx'), 'utf8')
    expect(lab).toContain('DesignToolBand')
    const band = readFileSync(join(SRC, 'components/lab/page/DesignToolBand.tsx'), 'utf8')
    expect(band).toContain('/lab/design-system')
    const discovery = readFileSync(join(SRC, 'components/lab/page/Discovery.tsx'), 'utf8')
    expect(discovery).not.toContain('design-system')
    for (const lang of LANGUAGES) expect(playgroundEntry.text[lang].length).toBeGreaterThan(60)
  })
})

describe('what the page says, in every language', () => {
  for (const lang of LANGUAGES) {
    const t = localize(playgroundText, lang)

    it(`${lang}: one h1, a labelled navigation to the five laboratories, the way back to the Lab, a reset and a status region`, () => {
      const html = wrap(lang, createElement(DesignPlaygroundPage))
      expect(html.match(/<h1/g)).toHaveLength(1)
      expect(html).toContain(`aria-label="${t.bar.navLabel}"`)
      for (const id of ['color', 'type', 'components', 'layout', 'motion']) {
        expect(html, id).toContain(`href="#${id}"`)
        expect(html, id).toContain(`id="${id}"`)
        expect(html, id).toContain(t.bar.sections[id as 'color'])
      }
      expect(html).toContain(`href="/${lang}/lab"`)
      expect(html).toContain(t.bar.resetAll)
      expect(html).toContain(t.common.reset)
      expect(html).toMatch(/role="status"[^>]*aria-live="polite"/)
      expect(html).toContain(t.hero.lead)
      expect(html).toContain(t.hero.facts.isolated)
    })

    it(`${lang}: every section has its own heading, and no raw key or placeholder shows`, () => {
      const html = wrap(lang, createElement(DesignPlaygroundPage))
      for (const title of [t.color.title, t.type.title, t.components.title, t.layout.title, t.motion.title]) expect(html).toContain(title)
      expect(html.match(/<h2/g)!.length).toBeGreaterThanOrEqual(6)
      expect(html).not.toMatch(/playground\.[a-z]+\.[a-z]/i)
      expect(html).not.toMatch(/\{[a-z]+\}/i)
      expect(html).not.toContain('undefined')
    })
  }
})

describe('the colour laboratory', () => {
  const state = initialState('dark')
  const noop = () => undefined
  const props = (lang: Language) => ({ t: localize(playgroundText, lang), lang, announce: noop })

  it.each(LANGUAGES)('%s: five fields with the brand names and tokens, a value, a picker, copy, and the original marked as original', (lang) => {
    const t = localize(playgroundText, lang)
    const html = wrap(lang, createElement(ColorLab, { ...props(lang), color: state.color, theme: 'dark', dispatch: noop, onReset: noop }))
    for (const name of ['Racing Red', 'Carbon Black', 'Cobalt Blue', 'Warm Paper', 'Graphite']) expect(html).toContain(name)
    for (const id of BRAND_IDS) expect(html).toContain(`--brand-${id}`)
    for (const hex of ['#ff161f', '#0b0b0d', '#445cff', '#f4f0e8', '#303036']) expect(html).toContain(`value="${hex}"`)
    expect(html.match(/type="color"/g)).toHaveLength(5)
    expect(html.match(new RegExp(t.color.original, 'g'))!.length).toBeGreaterThanOrEqual(5)
    expect(html).not.toContain(t.color.changed)
    expect(html).toContain(t.common.copyCss)
    // The pair's evaluation says pass or fail in words, not only with a tick.
    expect(html).toContain(t.common.pass)
    expect(html).toContain('17.30')
  })

  it('marks a changed colour as a temporary change, with the original beside it and a way back', () => {
    const changed = { ...state.color, draft: { ...state.color.draft, red: '#00ff88' }, palette: { ...state.color.palette, red: '#00ff88' } }
    const html = wrap('en', createElement(ColorLab, { ...props('en'), color: changed, theme: 'dark', dispatch: noop, onReset: noop }))
    expect(html).toContain('Changed here, temporary')
    expect(html).toContain('Original: #ff161f')
    expect(html).toContain('Restore')
  })

  it('names the reason beside a field that is wrong, and keeps the last valid colour in use', () => {
    const wrong = { ...state.color, draft: { ...state.color.draft, red: '#12' }, errors: { red: 'length' as const } }
    const html = wrap('en', createElement(ColorLab, { ...props('en'), color: wrong, theme: 'dark', dispatch: noop, onReset: noop }))
    expect(html).toContain('aria-invalid="true"')
    expect(html).toContain('A HEX colour has three or six digits.')
    expect(html).toContain('The preview keeps the last valid colour.')
  })

  it('says in words when a palette fails WCAG AA, and when it passes', () => {
    const flat = { ...state.color, palette: { red: '#808080', black: '#808080', blue: '#808080', paper: '#808080', graphite: '#808080' } }
    const bad = wrap('en', createElement(ColorLab, { ...props('en'), color: flat, theme: 'dark', dispatch: noop, onReset: noop }))
    expect(bad).toMatch(/Roles that do not reach WCAG 2 level AA: [1-9]/)
    const good = wrap('en', createElement(ColorLab, { ...props('en'), color: state.color, theme: 'dark', dispatch: noop, onReset: noop }))
    expect(good).toContain('Every role meets WCAG 2 level AA.')
  })
})

describe('the preview stage', () => {
  it('carries its own theme and its own custom properties, and nothing else carries them', () => {
    const html = wrap('en', createElement(PreviewStage, { theme: 'light', vars: { '--color-accent': '#00ff88' }, label: 'x' }, 'hello'))
    expect(html).toContain('data-theme="light"')
    expect(html).toContain('--color-accent:#00ff88')
    expect(html).toContain('data-playground-stage')
  })

  it('draws the real components inside it: the site’s Button, Badge, ServiceCard and ProjectCard, not copies', () => {
    const lab = readFileSync(join(HERE, 'ComponentLab.tsx'), 'utf8')
    for (const real of ['components/Button/Button', 'components/Badge/Badge', 'components/ServiceCard/ServiceCard', 'components/ProjectCard/ProjectCard', 'components/SectionHeading/SectionHeading', 'components/MainNav/MainNav', 'components/form/fields']) {
      expect(lab, real).toContain(real)
    }
    // No component of the playground is named like one of the site's.
    const names = ['Button', 'Badge', 'ServiceCard', 'ProjectCard', 'SectionHeading', 'MainNav', 'TextField', 'SelectField']
    for (const { file, text } of own.filter((source) => source.file.endsWith('.tsx'))) {
      for (const name of names) expect(text, `${file} defines ${name}`).not.toMatch(new RegExp(`(function|const|class)\\s+${name}\\b`))
    }
  })

  it.each(COMPONENT_IDS)('%s: its preview draws in every language', (id: ComponentId) => {
    for (const lang of LANGUAGES) {
      const components = { ...originalComponents(), selected: id }
      const html = wrap(lang, createElement(ComponentLab, { t: localize(playgroundText, lang), lang, announce: () => undefined, components, resetKey: 0, palette: initialState('dark').color.palette, theme: 'dark', dispatch: () => undefined, onReset: () => undefined }))
      const t = localize(playgroundText, lang)
      expect(html, `${id} ${lang}`).toContain(t.components.about[id])
      expect(html, `${id} ${lang}`).toContain('data-playground-stage')
      expect(html, `${id} ${lang}`).toContain(t.components.reset)
    }
  })

  it('names the source of every component it shows, and exposes nothing from the administration or the security code', () => {
    const lab = readFileSync(join(HERE, 'ComponentLab.tsx'), 'utf8')
    expect(lab).not.toMatch(/from '\.\.\/(admin|security|portal|quotes|booking|contact|ai)\b/)
    expect(lab).not.toMatch(/admin|password|secret|login/i)
    for (const id of COMPONENT_IDS) expect(lab).toContain(`${id}: '`)
  })
})

describe('the other laboratories', () => {
  const state = initialState('dark')
  const noop = () => undefined
  const common = (lang: Language) => ({ t: localize(playgroundText, lang), lang, announce: noop })

  it.each(LANGUAGES)('%s: type draws the three styles in a dark and a light stage, with labelled controls and the words limited', (lang) => {
    const t = localize(playgroundText, lang)
    const html = wrap(lang, createElement(TypeLab, { ...common(lang), type: state.type, dispatch: noop, onReset: noop }))
    // Two stages (the section's own band is a third element that carries the site's theme).
    expect(html.match(/data-playground-stage/g)).toHaveLength(2)
    expect(html.match(/data-playground-stage="" role="group" aria-label="[^"]*"/g)).toHaveLength(2)
    expect(html.match(/data-theme="light"/g)).toHaveLength(1)
    expect(html).toContain(t.type.sampleHeading)
    expect(html).toContain('maxLength="80"')
    expect(html).toContain('maxLength="400"')
    expect(html).toContain(t.type.families.archivo)
    expect(html).toContain(t.type.families.mono)
    // Only the three typefaces the project has: no other family is offered.
    expect(html).not.toMatch(/Comic|Times|Georgia|Helvetica Neue'|Roboto'/)
  })

  it('type drops the width control and offers two weights for a family that has no width axis', () => {
    const mono = { ...state.type, family: 'mono' as const }
    const html = wrap('en', createElement(TypeLab, { ...common('en'), type: mono, dispatch: noop, onReset: noop }))
    expect(html).not.toContain('Width')
    expect(html).toContain('The system and monospace stacks have two weights.')
  })

  it.each(LANGUAGES)('%s: layout draws six real cards in a frame, its readout and its bounded controls', (lang) => {
    const t = localize(playgroundText, lang)
    const html = wrap(lang, createElement(LayoutLab, { ...common(lang), layout: state.layout, palette: state.color.palette, theme: 'dark', dispatch: noop, onReset: noop }))
    expect(html.match(/<article/g)).toHaveLength(6)
    expect(html).toContain(t.layout.presets.mobile)
    expect(html).toContain(t.layout.presets.tablet)
    expect(html).toContain(t.layout.presets.desktop)
    expect(html).toMatch(/min="320"[^>]*max="1280"|max="1280"[^>]*min="320"/)
    expect(html).toMatch(/aria-valuetext="3"|aria-valuetext="960 px"/)
  })

  it.each(LANGUAGES)('%s: motion draws six replayable examples and the reduced-motion switch', (lang) => {
    const t = localize(playgroundText, lang)
    const html = wrap(lang, createElement(MotionLab, { ...common(lang), motion: state.motion, replay: state.replay, palette: state.color.palette, theme: 'dark', systemReduced: false, dispatch: noop, onReset: noop }))
    expect(html.match(new RegExp(`>${t.common.replay}<`, 'g'))).toHaveLength(6)
    expect(html).toContain(t.motion.simulate)
    expect(html).toContain('role="switch"')
    expect(html).toContain(t.motion.systemOff)
    expect(html).not.toContain(t.motion.reducedNote)
  })

  it('motion says so, and takes the examples’ timings out, when motion is reduced (the system’s or the visitor’s)', () => {
    const t = localize(playgroundText, 'en')
    for (const [simulate, system] of [[true, false], [false, true]] as const) {
      const html = wrap('en', createElement(MotionLab, { ...common('en'), motion: { ...state.motion, simulateReduced: simulate }, replay: state.replay, palette: state.color.palette, theme: 'dark', systemReduced: system, dispatch: noop, onReset: noop }))
      expect(html).toContain(t.motion.reducedNote)
      expect(html).toContain('--pg-duration:0.01ms')
      expect(html).toContain('--pg-distance:0px')
      expect(html).toContain('--pg-stagger:0ms')
    }
  })
})

describe('the playground’s words', () => {
  const tables: Record<string, unknown> = { playgroundText, playgroundEntry, playgroundMeta }
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
      expect(found.length).toBeGreaterThan(1)
      for (const [path, text] of found) {
        for (const lang of LANGUAGES) expect(text[lang].trim().length, `${path} ${lang}`).toBeGreaterThan(0)
        expect(placeholders(text.hu), path).toEqual(placeholders(text.en))
        expect(placeholders(text.nl), path).toEqual(placeholders(text.en))
      }
    })
  }

  it('has an error message, a pass and a fail word, and an announcement for every state a visitor can reach', () => {
    for (const lang of LANGUAGES) {
      const t = localize(playgroundText, lang)
      for (const key of ['empty', 'characters', 'length'] as const) expect(t.color.errors[key].length).toBeGreaterThan(10)
      expect(t.common.pass).not.toBe(t.common.fail)
      for (const key of ['copied', 'copyFailed', 'resetAll', 'resetSection', 'theme', 'replayed'] as const) expect(t.common.announce[key].length).toBeGreaterThan(8)
    }
  })

  it('never says anything that is not true: it makes up no price, customer, result or metric', () => {
    const everything = JSON.stringify([playgroundText, playgroundEntry, playgroundMeta])
    expect(everything).not.toMatch(/€|\bEUR\b|\bHUF\b|\$\d|\d\s?%\s*(faster|gyorsabb|sneller)|testimonial|ügyfél(ünk)?\s+mondta|klant(en)? zeggen/i)
  })
})

describe('the playground stays inside its page', () => {
  const FORBIDDEN: Array<[string, RegExp]> = [
    ['a network call', /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|navigator\.serviceWorker/],
    ['storage or cookies', /localStorage|sessionStorage|indexedDB|document\.cookie|caches\./],
    ['the analytics', /analytics\/|\btrack\(/],
    ['the backend or a secret', /config\/api|API_BASE|import\.meta\.env|process\.env/],
    ['a write to the site’s theme', /setTheme|toggleTheme|followSystem|applyTheme|storeTheme|documentElement|data-theme['"]\s*,|setAttribute\(\s*['"]data-theme/],
    ['a write to the document root or the body', /document\.(body|documentElement)\.(style|classList|setAttribute)|\.style\.setProperty\(/],
    ['code made from text', /\beval\s*\(|new Function|innerHTML|dangerouslySetInnerHTML|insertAdjacentHTML|document\.write/],
    ['a link out', /target="_blank"|window\.open|location\.(href|assign|replace)/],
  ]

  it('has none of: a network call, storage, the analytics, a secret, a write to the site’s theme or root, code made from text, or a link out', () => {
    for (const { file, text } of own.filter((source) => !source.file.endsWith('.scss'))) {
      // clipboard.ts is the one file that touches `document` (a hidden text area, removed at once) and it never touches the root's attributes or style.
      for (const [what, pattern] of FORBIDDEN) expect(pattern.test(text), `${file} has ${what}`).toBe(false)
    }
    const page = readFileSync(join(SRC, 'pages/DesignPlaygroundPage.tsx'), 'utf8')
    for (const [what, pattern] of FORBIDDEN) expect(pattern.test(page), `the page has ${what}`).toBe(false)
  })

  it('reads the site’s theme and never writes it', () => {
    const page = readFileSync(join(SRC, 'pages/DesignPlaygroundPage.tsx'), 'utf8')
    expect(page).toMatch(/const \{ theme: siteTheme \} = useTheme\(\)/)
    expect(page).not.toMatch(/useTheme\(\)[^\n]*(setTheme|toggleTheme)/)
  })

  it('writes custom properties only through a stage’s own style: never on the root, and every key is a custom property', () => {
    const stage = readFileSync(join(HERE, 'PreviewStage.tsx'), 'utf8')
    expect(stage).toContain('style={vars as CSSProperties}')
    for (const { file, text } of own.filter((source) => source.file.endsWith('.tsx'))) expect(text, file).not.toMatch(/documentElement|document\.body/)
  })

  it('gives every timer, observer and listener a way out', () => {
    for (const { file, text } of own.filter((source) => source.file.endsWith('.tsx') || source.file.endsWith('.ts'))) {
      const timers = (text.match(/\bsetTimeout\s*\(/g) ?? []).length
      const clears = (text.match(/\bclearTimeout\s*\(/g) ?? []).length
      if (timers > 0) expect(clears, `${file}: a timer without a clearTimeout`).toBeGreaterThan(0)
      expect(text, `${file} has an interval`).not.toMatch(/\bsetInterval\s*\(/)
      const observers = (text.match(/new (IntersectionObserver|ResizeObserver|MutationObserver)/g) ?? []).length
      const disconnects = (text.match(/\.disconnect\(\)/g) ?? []).length
      if (observers > 0) expect(disconnects, `${file}: an observer without a disconnect`).toBeGreaterThanOrEqual(observers)
      const listeners = (text.match(/addEventListener/g) ?? []).length
      const removals = (text.match(/removeEventListener/g) ?? []).length
      expect(removals, `${file}: a listener without a removal`).toBeGreaterThanOrEqual(listeners)
    }
    const page = readFileSync(join(SRC, 'pages/DesignPlaygroundPage.tsx'), 'utf8')
    expect((page.match(/new IntersectionObserver/g) ?? []).length).toBe((page.match(/observer\.disconnect\(\)/g) ?? []).length)
  })

  it('does not loop: nothing animates forever, and no requestAnimationFrame loop exists', () => {
    for (const { file, text } of own) {
      expect(text, file).not.toMatch(/animation-iteration-count\s*:\s*infinite|\binfinite\b/)
      expect(text, file).not.toMatch(/requestAnimationFrame/)
    }
  })

  it('moves only what the compositor can move, and has no literal duration: every time comes from a custom property', () => {
    for (const { file, text } of own.filter((source) => source.file.endsWith('.scss'))) {
      const css = text.replace(/\/\*[\s\S]*?\*\//g, '')
      for (const match of css.matchAll(/(?:^|[;{\s])(?:transition|animation)(?:-duration|-delay)?\s*:\s*([^;]+);/g)) {
        // The one literal time allowed is the reduced-motion answer itself: a hundredth of a millisecond, or none.
        const value = match[1].replace(/var\([^)]*\)/g, '').replace(/calc\([^;]*?\)/g, '').replace(/0\.01ms|0ms/g, '')
        expect(value, `${file}: ${match[0].trim()}`).not.toMatch(/(^|[\s,])\d*\.?\d+m?s(?=[\s,;)]|$)/)
      }
    }
  })

  it('answers reduced motion in every stylesheet that animates or transitions', () => {
    for (const { file, text } of own.filter((source) => source.file.endsWith('.scss'))) {
      if (/@keyframes|animation\s*:|transition\s*:[^;]*--pg-/.test(text)) expect(text, file).toMatch(/prefers-reduced-motion/)
    }
  })

  it('keeps its code out of the main bundle: only the lazy route and the head’s small file are read by the site’s main code', () => {
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8')
    expect(app).toMatch(/lazyRoute\(\(\) => import\('\.\/pages\/DesignPlaygroundPage'\)/)
    expect(app).not.toMatch(/from '\.\/playground/)
    expect(app).not.toMatch(/from '\.\/pages\/DesignPlaygroundPage'/)
    const main = [join(SRC, 'routes/pages.ts'), join(SRC, 'routes/documentMeta.ts'), join(SRC, 'seo/jsonLd.ts'), join(SRC, 'motion/config.ts')]
    for (const file of main) expect(readFileSync(file, 'utf8'), file).not.toMatch(/from '\.\.\/playground\//)
    // The Lab page reads only the band's small words (entry.ts), never the playground's (text.ts).
    const band = readFileSync(join(SRC, 'components/lab/page/DesignToolBand.tsx'), 'utf8')
    expect(band).toContain('content/playground/entry')
    expect(band).not.toContain('content/playground/text')
  })
})

describe('keyboard and structure', () => {
  it('uses native controls only: no role=button on a div, no tabindex above 0, no click handler on a non-interactive element', () => {
    for (const { file, text } of own.filter((source) => source.file.endsWith('.tsx'))) {
      expect(text, file).not.toMatch(/role="button"/)
      expect(text, file).not.toMatch(/tabIndex=\{?[1-9]/)
      expect(text, file).not.toMatch(/<div[^>]*onClick=/)
      expect(text, file).not.toMatch(/<span[^>]*onClick=/)
    }
  })

  it('makes the one scrollable box reachable by keyboard and names it', () => {
    const motion = readFileSync(join(HERE, 'MotionLab.tsx'), 'utf8')
    expect(motion).toMatch(/role="region" aria-label=\{[^}]+\} tabIndex=\{0\}/)
  })

  it('gives every colour picker and every field a name', () => {
    const color = readFileSync(join(HERE, 'ColorLab.tsx'), 'utf8')
    expect(color).toMatch(/type="color"[\s\S]*?aria-label=/)
    expect(color).toContain('<legend')
  })
})
