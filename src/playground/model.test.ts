import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  BRAND_IDS,
  BRAND_TOKENS,
  bestOn,
  contrastReport,
  contrastRatio,
  derivedTokens,
  hexToRgb,
  isOriginalPalette,
  luminance,
  mix,
  originalPalette,
  parseHex,
  paletteCss,
  previewTokens,
  readable,
  rgbToHex,
  showRatio,
  wcag,
  type Palette,
} from './color'
import { ALIGNMENTS, LAYOUT_BOUNDS, MIN_COLUMN, PREVIEW_PRESETS, clampLayout, columnsFor, containerIn, layoutCss } from './layout'
import { EASINGS, MOTION_BOUNDS, MOTION_DEFAULTS, clampMotion, isReduced, motionCss, motionVars } from './motion'
import { COMPONENT_IDS, REPLAY_IDS, changedColors, initialState, isChanged, originalComponents, originalLayout, originalMotion, originalType, reducer, type Action } from './state'
import { FAMILY_STACKS, FONT_FAMILIES, SCALE_RATIOS, TEXT_MAX, TYPE_BOUNDS, bounded, cleanText, clampType, hasWidth, typeCss, typeScale, weightsFor } from './typography'

const tokens = readFileSync(fileURLToPath(new URL('../styles/tokens.css', import.meta.url)), 'utf8')
const token = (name: string): string => new RegExp(`${name}:\\s*([^;]+);`).exec(tokens)?.[1].trim() ?? ''

describe('the brand palette', () => {
  it('is the brand tokens of tokens.css: the playground starts from the real colours', () => {
    for (const id of BRAND_IDS) expect(token(BRAND_TOKENS[id].token), id).toBe(BRAND_TOKENS[id].hex)
    expect(Object.fromEntries(BRAND_IDS.map((id) => [id, BRAND_TOKENS[id].hex]))).toEqual({ red: '#ff161f', black: '#0b0b0d', blue: '#445cff', paper: '#f4f0e8', graphite: '#303036' })
  })

  it('is a new object every time, and knows when it is untouched', () => {
    const a = originalPalette()
    const b = originalPalette()
    expect(a).not.toBe(b)
    a.red = '#000000'
    expect(b.red).toBe('#ff161f')
    expect(isOriginalPalette(originalPalette())).toBe(true)
    expect(isOriginalPalette(a)).toBe(false)
  })
})

describe('reading a HEX colour', () => {
  it.each([
    ['#ff161f', '#ff161f'],
    ['FF161F', '#ff161f'],
    ['  #AbCdEf ', '#abcdef'],
    ['#fff', '#ffffff'],
    ['0a0', '#00aa00'],
  ])('%s is a colour', (input, hex) => {
    expect(parseHex(input)).toEqual({ ok: true, hex })
  })

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['#', 'empty'],
    ['#gg0000', 'characters'],
    ['red', 'characters'],
    ['#12', 'length'],
    ['#12345', 'length'],
    ['#1234567', 'length'],
    ['#ff161f00', 'length'],
    ['rgb(1,2,3)', 'characters'],
    ['<script>', 'characters'],
    ['１２３４５６', 'characters'],
  ])('%j is refused (%s)', (input, error) => {
    expect(parseHex(input)).toEqual({ ok: false, error })
  })

  it('never throws, whatever it is given', () => {
    for (const input of ['\u0000', '#'.repeat(5000), '\n', '#ff161f\n', '%00', '0x123456', 'ﬀﬀﬀ']) expect(() => parseHex(input)).not.toThrow()
  })

  it('converts to rgb and back without loss', () => {
    expect(hexToRgb('#ff161f')).toEqual([255, 22, 31])
    for (const id of BRAND_IDS) expect(rgbToHex(hexToRgb(BRAND_TOKENS[id].hex))).toBe(BRAND_TOKENS[id].hex)
    expect(rgbToHex([300, -4, 12.4])).toBe('#ff000c')
  })
})

describe('contrast', () => {
  it('knows the extremes: 21:1 for black on white, 1:1 for a colour on itself', () => {
    expect(luminance('#000000')).toBe(0)
    expect(luminance('#ffffff')).toBeCloseTo(1, 10)
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10)
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 10)
    expect(contrastRatio('#336699', '#336699')).toBe(1)
  })

  it('matches published reference values', () => {
    // #767676 on white is the usual "just passes AA" grey: 4.54:1.
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
    // #777777 on white fails AA: 4.48:1.
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
  })

  it('reads the brand pairs: Warm Paper on Carbon Black is far above AAA, Racing Red on Carbon Black is large-text and graphics only for the red on paper', () => {
    expect(contrastRatio(BRAND_TOKENS.paper.hex, BRAND_TOKENS.black.hex)).toBeGreaterThan(15)
    expect(wcag(contrastRatio(BRAND_TOKENS.paper.hex, BRAND_TOKENS.black.hex)).aaa).toBe(true)
    const redOnPaper = contrastRatio(BRAND_TOKENS.red.hex, BRAND_TOKENS.paper.hex)
    expect(redOnPaper).toBeLessThan(4.5)
    expect(wcag(redOnPaper).aa).toBe(false)
  })

  it('draws the WCAG lines exactly: 4.5 passes AA, 4.4999 does not; 3 passes large; 7 passes AAA', () => {
    expect(wcag(4.5)).toMatchObject({ aa: true, aaLarge: true, aaa: false, aaaLarge: true, ui: true })
    expect(wcag(4.4999)).toMatchObject({ aa: false, aaLarge: true, aaaLarge: false })
    expect(wcag(3)).toMatchObject({ aaLarge: true, ui: true })
    expect(wcag(2.9999)).toMatchObject({ aaLarge: false, ui: false })
    expect(wcag(7)).toMatchObject({ aaa: true })
    expect(wcag(6.9999).aaa).toBe(false)
  })

  it('shows a ratio cut, never rounded up: a pair that fails never reads as passing', () => {
    expect(showRatio(4.499)).toBe('4.49')
    expect(showRatio(4.5)).toBe('4.50')
    expect(showRatio(21)).toBe('21.00')
    expect(showRatio(2.999999)).toBe('2.99')
  })
})

describe('mixing and reading colours', () => {
  it('mixes channel by channel and stays inside 0 to 1', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#ff0000', '#0000ff', 0)).toBe('#ff0000')
    expect(mix('#ff0000', '#0000ff', 1)).toBe('#0000ff')
    expect(mix('#ff0000', '#0000ff', 7)).toBe('#0000ff')
    expect(mix('#ff0000', '#0000ff', -3)).toBe('#ff0000')
  })

  it('moves a colour only as far as it must to be readable', () => {
    expect(readable('#ffffff', '#000000', 4.5, '#ffffff')).toBe('#ffffff')
    const moved = readable('#ff161f', '#0b0b0d', 8, '#f4f0e8')
    expect(contrastRatio(moved, '#0b0b0d')).toBeGreaterThanOrEqual(8)
    // It never goes further than the colour it moves toward.
    expect(readable('#777777', '#808080', 21, '#000000')).toBe('#000000')
  })

  it('chooses the best of the candidates, the first on a tie', () => {
    expect(bestOn('#ff161f', ['#0b0b0d', '#ffffff'])).toBe('#0b0b0d')
    expect(bestOn('#000000', ['#222222', '#ffffff', '#444444'])).toBe('#ffffff')
    expect(bestOn('#000000', ['#ffffff', '#ffffff'])).toBe('#ffffff')
  })
})

describe('what a palette makes inside the preview', () => {
  const changed: Palette = { ...originalPalette(), red: '#00ff88' }

  it('is NOTHING for the original palette: the preview is then the site’s own tokens, exactly', () => {
    expect(previewTokens(originalPalette(), 'dark')).toEqual({})
    expect(previewTokens(originalPalette(), 'light')).toEqual({})
  })

  it('is custom properties only, with plain hex values, once a colour is changed', () => {
    for (const theme of ['dark', 'light'] as const) {
      const made = previewTokens(changed, theme)
      expect(Object.keys(made).length).toBeGreaterThan(25)
      for (const [name, value] of Object.entries(made)) {
        expect(name, name).toMatch(/^--(brand|color)-[a-z-]+$/)
        expect(value, `${name}: ${value}`).toMatch(/^#[0-9a-f]{6}$/)
      }
      expect(made['--brand-red']).toBe('#00ff88')
      expect(made['--color-accent']).toBe('#00ff88')
    }
  })

  it('reads dark as paper on black and light as black on paper, as the site does', () => {
    const dark = derivedTokens(originalPalette(), 'dark')
    const light = derivedTokens(originalPalette(), 'light')
    expect([dark['--color-bg'], dark['--color-text']]).toEqual(['#0b0b0d', '#f4f0e8'])
    expect([light['--color-bg'], light['--color-text']]).toEqual(['#f4f0e8', '#0b0b0d'])
  })

  it('makes the text colours readable whenever the palette allows it', () => {
    for (const theme of ['dark', 'light'] as const) {
      const report = contrastReport(originalPalette(), theme)
      for (const row of report) expect(row.ok, `${theme} ${row.id}: ${row.ratio}`).toBe(true)
    }
  })

  it('keeps every value valid for any palette, even a hostile one, and says which roles fail', () => {
    let seed = 7
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    for (let round = 0; round < 60; round += 1) {
      const palette = Object.fromEntries(BRAND_IDS.map((id) => [id, rgbToHex([random() * 255, random() * 255, random() * 255])])) as Palette
      for (const theme of ['dark', 'light'] as const) {
        const made = derivedTokens(palette, theme)
        for (const value of Object.values(made)) expect(value).toMatch(/^#[0-9a-f]{6}$/)
        for (const row of contrastReport(palette, theme)) {
          expect(Number.isFinite(row.ratio)).toBe(true)
          expect(row.ok).toBe(row.ratio >= row.needs)
        }
      }
    }
    // The same colour for background and text cannot be readable, and the report says so.
    const flat: Palette = { red: '#808080', black: '#808080', blue: '#808080', paper: '#808080', graphite: '#808080' }
    expect(contrastReport(flat, 'dark').some((row) => !row.ok)).toBe(true)
  })

  it('writes the CSS of a palette as the five brand tokens', () => {
    expect(paletteCss(originalPalette())).toBe(':root {\n  --brand-red: #ff161f;\n  --brand-black: #0b0b0d;\n  --brand-blue: #445cff;\n  --brand-paper: #f4f0e8;\n  --brand-graphite: #303036;\n}')
  })
})

describe('typography', () => {
  const original = originalType()

  it('offers only the families the project has: the brand face, the system stack and the monospace stack', () => {
    expect([...FONT_FAMILIES]).toEqual(['archivo', 'system', 'mono'])
    expect(FAMILY_STACKS.archivo).toBe('var(--font-sans)')
    expect(token('--font-sans')).toContain('Archivo Variable')
    // No other face is named in the playground's stacks except the stacks the site's stylesheets already use.
    for (const stack of Object.values(FAMILY_STACKS)) expect(stack).not.toMatch(/https?:|url\(|@import/)
  })

  it('starts from the site’s own weights', () => {
    expect(original.headingWeight).toBe(Number(token('--fw-black')))
    expect(original.bodyWeight).toBe(Number(token('--fw-regular')))
    expect(original.lineHeight).toBe(Number(token('--lh-normal')))
    expect(original.tracking).toBe(Number(token('--ls-normal')))
  })

  it('keeps every control inside its bounds', () => {
    const wild = clampType({ size: 9999, lineHeight: -4, tracking: 12, width: 1, headingWeight: 5000, bodyWeight: -1 }, original)
    expect(wild.size).toBe(TYPE_BOUNDS.size.max)
    expect(wild.lineHeight).toBe(TYPE_BOUNDS.lineHeight.min)
    expect(wild.tracking).toBe(TYPE_BOUNDS.tracking.max)
    expect(wild.width).toBe(TYPE_BOUNDS.width.min)
    expect(wild.headingWeight).toBe(900)
    expect(wild.bodyWeight).toBe(100)
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, '18' as unknown as number, null as unknown as number]) expect(clampType({ size: bad }, original).size).toBe(original.size)
  })

  it('snaps to each control’s step', () => {
    expect(bounded(18.4, TYPE_BOUNDS.size, 18)).toBe(18)
    expect(bounded(1.52, TYPE_BOUNDS.lineHeight, 1.5)).toBe(1.5)
    expect(clampType({ headingWeight: 640 }, original).headingWeight).toBe(600)
  })

  it('supports weights per family and drops the width axis where there is none', () => {
    expect(weightsFor('archivo')).toHaveLength(9)
    expect(weightsFor('system')).toEqual([400, 700])
    expect(weightsFor('mono')).toEqual([400, 700])
    const system = clampType({ family: 'system', headingWeight: 800, bodyWeight: 300, width: 80 }, original)
    expect(system.headingWeight).toBe(700)
    expect(system.bodyWeight).toBe(400)
    expect(system.width).toBe(100)
    expect(hasWidth('archivo')).toBe(true)
    expect(hasWidth('mono')).toBe(false)
    expect(clampType({ family: 'archivo', width: 80 }, original).width).toBe(80)
  })

  it('refuses a family or a ratio it does not offer', () => {
    expect(clampType({ family: 'Comic Sans' as never }, original).family).toBe('archivo')
    expect(clampType({ family: 'url(https://example.test/x.woff2)' as never }, original).family).toBe('archivo')
    expect(clampType({ ratio: 1.7 }, original).ratio).toBe(original.ratio)
    for (const ratio of SCALE_RATIOS) expect(clampType({ ratio }, original).ratio).toBe(ratio)
  })

  it('cleans the words: no control characters, one line, cut to the limit by code point', () => {
    expect(cleanText('a\u0000b\u0007c', 10)).toBe('abc')
    expect(cleanText('line one\nline  two\t\tthree', 100)).toBe('line one line two three')
    expect(cleanText('x'.repeat(500), TEXT_MAX.heading)).toHaveLength(TEXT_MAX.heading)
    expect(cleanText('😀'.repeat(100), 80)).toBe('😀'.repeat(80))
    expect(cleanText(42 as unknown as string, 10)).toBe('')
    // Markup is only ever drawn as text; cleaning keeps it as the characters it is.
    expect(cleanText('<img src=x onerror=alert(1)>', 100)).toBe('<img src=x onerror=alert(1)>')
  })

  it('works out the three sizes from the body size and the ratio', () => {
    expect(typeScale({ size: 16, ratio: 1.25 })).toEqual({ heading: 31.3, body: 16, caption: 12.8 })
    expect(typeScale({ size: 12, ratio: 1.5 }).caption).toBe(10)
    const scale = typeScale({ size: 18, ratio: 1.333 })
    expect(scale.heading).toBeGreaterThan(scale.body)
    expect(scale.body).toBeGreaterThan(scale.caption)
  })

  it('writes CSS a visitor can copy, with the width axis only for the brand face', () => {
    expect(typeCss(original)).toContain('font-stretch: 100%;')
    expect(typeCss(clampType({ family: 'mono' }, original))).not.toContain('font-stretch')
    expect(typeCss(original)).toContain('.heading {')
  })
})

describe('layout', () => {
  const original = originalLayout()

  it('keeps every value inside its bound and on its step', () => {
    const wild = clampLayout({ container: 99999, columns: 0, gap: -50, padding: 1000, radius: 77, previewWidth: 1 }, original)
    expect(wild).toMatchObject({ container: LAYOUT_BOUNDS.container.max, columns: LAYOUT_BOUNDS.columns.min, gap: 0, padding: LAYOUT_BOUNDS.padding.max, radius: LAYOUT_BOUNDS.radius.max, previewWidth: LAYOUT_BOUNDS.previewWidth.min })
    expect(clampLayout({ gap: 25 }, original).gap % 4).toBe(0)
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, '3' as unknown as number, undefined]) expect(clampLayout({ columns: bad as number }, original).columns).toBe(original.columns)
  })

  it('keeps every preset width exactly as it is: a chosen device stays chosen (found in a real browser: 768 became 770)', () => {
    for (const width of Object.values(PREVIEW_PRESETS)) expect(clampLayout({ previewWidth: width }, original).previewWidth, String(width)).toBe(width)
  })

  it('accepts only the alignments it has', () => {
    for (const align of ALIGNMENTS) expect(clampLayout({ align }, original).align).toBe(align)
    expect(clampLayout({ align: 'baseline' as never }, original).align).toBe(original.align)
  })

  it('gives fewer columns in a narrower frame: the same layout answers a phone, a tablet and a desktop', () => {
    const wide = (width: number) => columnsFor(width, 4, 24, 24, 1280)
    expect(wide(PREVIEW_PRESETS.desktop)).toBe(4)
    expect(wide(PREVIEW_PRESETS.tablet)).toBeLessThanOrEqual(4)
    expect(wide(PREVIEW_PRESETS.mobile)).toBeLessThan(wide(PREVIEW_PRESETS.tablet))
    expect(wide(PREVIEW_PRESETS.mobile)).toBeGreaterThanOrEqual(1)
    expect(wide(320)).toBe(1)
    expect(columnsFor(10, 6, 64, 64, 1280)).toBe(1)
    expect(columnsFor(0, 6, 0, 0, 0)).toBe(1)
  })

  it('never lets a card get narrower than the minimum', () => {
    for (const frame of [320, 360, 480, 768, 1024, 1280]) {
      for (const wanted of [1, 2, 3, 4, 5, 6]) {
        for (const gap of [0, 24, 64]) {
          const columns = columnsFor(frame, wanted, gap, 24, 1280)
          expect(columns).toBeLessThanOrEqual(wanted)
          if (columns > 1) expect((Math.min(1280, frame) - 48 - gap * (columns - 1)) / columns).toBeGreaterThanOrEqual(MIN_COLUMN - 1)
        }
      }
    }
  })

  it('takes the container’s width or the frame’s, whichever is smaller', () => {
    expect(containerIn(500, 960)).toBe(500)
    expect(containerIn(1280, 960)).toBe(960)
    expect(containerIn(-3, 960)).toBe(0)
  })

  it('writes CSS a visitor can copy', () => {
    expect(layoutCss(original)).toContain('max-width: 960px;')
    expect(layoutCss(original)).toContain('repeat(3, minmax(0, 1fr))')
  })
})

describe('motion', () => {
  const original = originalMotion()

  it('starts from the site’s own duration, curve, distance and stagger', () => {
    expect(MOTION_DEFAULTS.duration).toBe(parseInt(token('--dur-base'), 10))
    expect(MOTION_DEFAULTS.distance).toBe(parseInt(token('--motion-distance-md'), 10))
    expect(MOTION_DEFAULTS.stagger).toBe(parseInt(token('--motion-stagger'), 10))
    expect(MOTION_DEFAULTS.easing).toBe('out')
    for (const easing of EASINGS) {
      expect(token(easing.token), easing.id).toMatch(/^cubic-bezier\(/)
      // The literal curve the stage uses is the site's own, token for token.
      expect(easing.curve.replace(/\s+/g, ''), easing.id).toBe(token(easing.token).replace(/\s+/g, ''))
    }
  })

  it('keeps every parameter inside its bound and on its step', () => {
    const wild = clampMotion({ duration: 99999, distance: -9, stagger: 5000, easing: 'bounce' as never }, original)
    expect(wild).toMatchObject({ duration: MOTION_BOUNDS.duration.max, distance: 0, stagger: MOTION_BOUNDS.stagger.max, easing: 'out' })
    expect(clampMotion({ duration: 250 }, original).duration % 20).toBe(0)
    expect(clampMotion({ simulateReduced: 'yes' as never }, original).simulateReduced).toBe(false)
  })

  it('takes every duration, distance and delay out under reduced motion, whether the system asks or the visitor does', () => {
    const on = { ...original, simulateReduced: true }
    for (const [state, system] of [[original, true], [on, false], [on, true]] as const) {
      expect(isReduced(state, system)).toBe(true)
      const vars = motionVars({ ...state, duration: 900, distance: 60, stagger: 150 }, system)
      expect(vars['--pg-duration']).toBe('0.01ms')
      expect(vars['--pg-distance']).toBe('0px')
      expect(vars['--pg-stagger']).toBe('0ms')
      expect(vars['--dur-base']).toBe('0.01ms')
      expect(vars['--dur-fast']).toBe('0.01ms')
    }
    expect(isReduced(original, false)).toBe(false)
    expect(motionVars({ ...original, duration: 600 }, false)['--pg-duration']).toBe('600ms')
  })

  it('points the curve at the site’s own token, and only at those', () => {
    for (const easing of EASINGS) expect(motionVars({ ...original, easing: easing.id }, false)['--pg-ease']).toBe(easing.curve)
    expect(motionCss(original)).toContain('var(--ease-out)')
  })

  it('never makes a custom property refer to itself: a cycle would make every use of it invalid (found in a real browser)', () => {
    for (const easing of EASINGS) {
      for (const reduced of [false, true]) {
        const vars = motionVars({ ...original, easing: easing.id, simulateReduced: reduced }, false)
        for (const [name, value] of Object.entries(vars)) expect(value, `${name} in ${easing.id}`).not.toContain(`var(${name})`)
      }
    }
  })
})

describe('the playground’s state', () => {
  const run = (state: ReturnType<typeof initialState>, ...actions: Action[]) => actions.reduce(reducer, state)
  const start = () => initialState('dark')

  it('starts from the originals, and every start is its own object', () => {
    const a = start()
    const b = start()
    expect(a).toEqual(b)
    expect(a).not.toBe(b)
    expect(a.color.palette).not.toBe(b.color.palette)
    expect(a.components).not.toBe(b.components)
    expect(isChanged(a, 'dark')).toBe(false)
    expect(initialState('light').theme).toBe('light')
  })

  it('takes a valid colour at once and keeps the last valid one while the field is wrong', () => {
    let state = run(start(), { type: 'color/draft', id: 'red', value: '#00ff88' })
    expect(state.color.palette.red).toBe('#00ff88')
    expect(state.color.errors.red).toBeUndefined()
    state = run(state, { type: 'color/draft', id: 'red', value: '#00ff8' })
    expect(state.color.draft.red).toBe('#00ff8')
    expect(state.color.palette.red).toBe('#00ff88')
    expect(state.color.errors.red).toBe('length')
    state = run(state, { type: 'color/draft', id: 'red', value: 'nope' })
    expect(state.color.errors.red).toBe('characters')
    state = run(state, { type: 'color/draft', id: 'red', value: '' })
    expect(state.color.errors.red).toBe('empty')
    expect(state.color.palette.red).toBe('#00ff88')
    state = run(state, { type: 'color/draft', id: 'red', value: 'f00' })
    expect(state.color.palette.red).toBe('#ff0000')
    expect(state.color.errors.red).toBeUndefined()
    expect(changedColors(state.color)).toEqual(['red'])
  })

  it('ignores a colour for a brand id it does not have, and a picker value that is not a colour', () => {
    const state = start()
    expect(reducer(state, { type: 'color/draft', id: 'orange' as never, value: '#fff' })).toBe(state)
    expect(reducer(state, { type: 'color/pick', id: 'red', hex: 'banana' })).toBe(state)
    expect(reducer(state, { type: 'color/pair', fg: 'nope' as never }).color.fg).toBe('paper')
    expect(run(state, { type: 'color/pick', id: 'blue', hex: '#123456' }).color.draft.blue).toBe('#123456')
  })

  it('limits what is kept of a typed colour, so a pasted novel is not stored', () => {
    expect(reducer(start(), { type: 'color/draft', id: 'red', value: 'a'.repeat(5000) }).color.draft.red).toHaveLength(24)
  })

  it('sends every other change through the bounds of its model', () => {
    const state = run(start(), { type: 'type/set', patch: { size: 5000, family: 'mono' } }, { type: 'layout/set', patch: { columns: 99, gap: -1 } }, { type: 'motion/set', patch: { duration: 1 } })
    expect(state.type.size).toBe(TYPE_BOUNDS.size.max)
    expect(state.type.family).toBe('mono')
    expect(state.layout.columns).toBe(LAYOUT_BOUNDS.columns.max)
    expect(state.layout.gap).toBe(0)
    expect(state.motion.duration).toBe(MOTION_BOUNDS.duration.min)
  })

  it('changes a component’s own properties only: right keys, right types', () => {
    let state = run(start(), { type: 'components/set', id: 'button', patch: { variant: 'text', arrow: false } })
    expect(state.components.button).toMatchObject({ variant: 'text', arrow: false })
    state = run(state, { type: 'components/set', id: 'button', patch: { nonsense: true, size: 3 as never, disabled: 'yes' as never } })
    expect(state.components.button).not.toHaveProperty('nonsense')
    expect(state.components.button.size).toBe('md')
    expect(state.components.button.disabled).toBe(false)
    expect(reducer(state, { type: 'components/select', id: 'admin' as never })).toBe(state)
    expect(run(state, { type: 'components/select', id: 'service' }).components.selected).toBe('service')
    expect(COMPONENT_IDS).not.toContain('admin')
  })

  it('resets one section, or everything, to the originals', () => {
    let state = run(
      start(),
      { type: 'color/draft', id: 'red', value: '#00ff88' },
      { type: 'type/set', patch: { size: 30, heading: 'Hello' } },
      { type: 'layout/set', patch: { columns: 5 } },
      { type: 'motion/set', patch: { duration: 800, simulateReduced: true } },
      { type: 'components/set', id: 'button', patch: { variant: 'text' } },
      { type: 'theme', theme: 'light' },
    )
    expect(isChanged(state, 'dark')).toBe(true)
    expect(reducer(state, { type: 'reset', scope: 'color', siteTheme: 'dark' }).color).toEqual(initialState('dark').color)
    expect(reducer(state, { type: 'reset', scope: 'color', siteTheme: 'dark' }).type.size).toBe(30)
    expect(reducer(state, { type: 'reset', scope: 'type', siteTheme: 'dark' }).type).toEqual(originalType())
    expect(reducer(state, { type: 'reset', scope: 'layout', siteTheme: 'dark' }).layout).toEqual(originalLayout())
    expect(reducer(state, { type: 'reset', scope: 'motion', siteTheme: 'dark' }).motion).toEqual(originalMotion())
    expect(reducer(state, { type: 'reset', scope: 'components', siteTheme: 'dark' }).components).toEqual(originalComponents())
    state = reducer(state, { type: 'reset', scope: 'all', siteTheme: 'dark' })
    expect(isChanged(state, 'dark')).toBe(false)
    expect({ ...state, replay: 0 }).toEqual({ ...initialState('dark'), replay: 0 })
    // The theme of the previews goes back to the site's, which is the theme given with the reset.
    expect(reducer(state, { type: 'reset', scope: 'all', siteTheme: 'light' }).theme).toBe('light')
  })

  it('restarts every example on a reset and on a replay, and only that one on a replay', () => {
    const state = start()
    expect(run(state, { type: 'replay', id: 'hover' }).replay).toEqual({ ...state.replay, hover: 1 })
    expect(reducer(state, { type: 'replay', id: 'bogus' as never })).toBe(state)
    for (const id of REPLAY_IDS) expect(reducer(state, { type: 'reset', scope: 'all', siteTheme: 'dark' }).replay[id]).toBe(1)
  })

  it('does not share anything between two visits: changing one never changes the other', () => {
    const one = start()
    const two = start()
    const changed = run(one, { type: 'color/draft', id: 'red', value: '#00ff88' }, { type: 'components/set', id: 'badge', patch: { kind: 'live' } })
    expect(two.color.palette.red).toBe('#ff161f')
    expect(two.components.badge.kind).toBe('demo')
    expect(one.color.palette.red).toBe('#ff161f')
    expect(changed.color.palette.red).toBe('#00ff88')
    expect(originalComponents().badge.kind).toBe('demo')
  })

  it('does not accept an action it does not know', () => {
    const state = start()
    expect(reducer(state, { type: 'format-disk' } as never)).toBe(state)
  })
})
