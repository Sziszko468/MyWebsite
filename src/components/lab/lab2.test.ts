import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { experiments, playableExperiments, type LabId, type LabInput } from '../../content/lab'
import { experimentText, labText } from '../../content/labText'
import { LANGUAGES, type Language } from '../../i18n/config'
import { I18nContext } from '../../i18n/context'
import { dictionaries } from '../../i18n/dictionaries'
import { flattenKinetic } from '../../test/markup'
import { ThemeContext } from '../../theme/context'
import { createFullscreenController, type FullscreenDocument, type FullscreenMode, type FullscreenTarget } from './core/fullscreen'
import { LabPointer } from './core/LabPointer'
import { applyStageKey } from './core/useLabInput'
import { CHROMATIC_DEFAULTS, CHROMATIC_MODES, chromaticText } from './experiments/chromatic/chromaticControls'
import { CHROMATIC_FRAGMENT } from './experiments/chromatic/chromaticShaders'
import { generativeText, MAX_SEED, makeFrom, parseSeed, seedFieldText, startControls } from './experiments/generative/generativeControls'
import { PARTICLE_DEFAULTS } from './experiments/particles/particleControls'
import { ARRANGEMENTS, generateShape, SHAPES } from './experiments/particles/particleShapes'
import { ParticleSim } from './experiments/particles/particleSim'
import { LOOK, lookAfterDrag, SPACE_DEFAULTS, spaceText } from './experiments/space/spaceControls'
import { Discovery } from './page/Discovery'
import { pageText } from './page/pageText'
import { LabControlsDemo } from './lab2.fixtures'
import { LabFullscreen } from './ui/LabFullscreen'
import { LabHelp } from './ui/LabHelp'

/**
 * Lab 2.0 (PROMPT 34): the shared shell's new parts (full screen, "how to use it", the inputs on every tile, the keyboard on the
 * stage) and the new controls of three experiences (an arrangement for the particles, a mode for the chromatic shader, a
 * dragged look for Infinite Space). The browser side of each is checked by tools/e2e/lab2-journey.cjs.
 */

const SIX: readonly LabId[] = ['particle-universe', 'liquid-matter', 'type-in-motion', 'infinite-space', 'chromatic-distortion', 'generative-objects']

function inLanguage(lang: Language, child: ReturnType<typeof createElement>) {
  return flattenKinetic(
    renderToStaticMarkup(
      createElement(
        ThemeContext.Provider,
        { value: { theme: 'dark', setTheme: () => undefined, toggleTheme: () => undefined, followSystem: () => undefined } },
        createElement(MemoryRouter, { initialEntries: [`/${lang}/lab`] }, createElement(I18nContext.Provider, { value: { lang, t: dictionaries[lang] } }, child)),
      ),
    ),
  )
}

// ── Full screen ─────────────────────────────────────────────────────────────

class FakeDocument implements FullscreenDocument {
  fullscreenEnabled: boolean | undefined = true
  fullscreenElement: Element | null = null
  private listeners = new Set<() => void>()
  exitCalls = 0
  exitFullscreen = vi.fn(async () => {
    this.exitCalls += 1
    this.fullscreenElement = null
    this.fire()
  })
  addEventListener(_type: 'fullscreenchange', listener: () => void) {
    this.listeners.add(listener)
  }
  removeEventListener(_type: 'fullscreenchange', listener: () => void) {
    this.listeners.delete(listener)
  }
  listenerCount() {
    return this.listeners.size
  }
  fire() {
    for (const listener of [...this.listeners]) listener()
  }
}

function fakeElement(doc: FakeDocument, behaviour: 'works' | 'refuses' | 'missing' = 'works'): FullscreenTarget & Element {
  const element = {} as FullscreenTarget & Element
  if (behaviour !== 'missing') {
    element.requestFullscreen = vi.fn(async () => {
      if (behaviour === 'refuses') throw new TypeError('Fullscreen request denied')
      doc.fullscreenElement = element
      doc.fire()
    })
  }
  return element
}

function track(doc: FakeDocument, element: FullscreenTarget & Element) {
  const modes: FullscreenMode[] = []
  const controller = createFullscreenController(doc, element, (mode) => modes.push(mode))
  return { controller, modes }
}

describe('full screen', () => {
  it('enters the browser\'s full screen on the experiment\'s own element, and leaves it by the same button', async () => {
    const doc = new FakeDocument()
    const element = fakeElement(doc)
    const { controller, modes } = track(doc, element)
    expect(controller.mode()).toBe('off')
    expect(controller.native()).toBe(true)

    await controller.toggle()
    expect(controller.mode()).toBe('native')
    expect(element.requestFullscreen).toHaveBeenCalledTimes(1)

    await controller.toggle()
    expect(controller.mode()).toBe('off')
    expect(doc.exitCalls).toBe(1)
    expect(modes).toEqual(['native', 'off'])
  })

  it('notices when the browser leaves full screen by itself (Escape, its own button) and reports it once', async () => {
    const doc = new FakeDocument()
    const element = fakeElement(doc)
    const { controller, modes } = track(doc, element)
    await controller.enter()

    doc.fullscreenElement = null
    doc.fire()
    expect(controller.mode()).toBe('off')
    expect(modes).toEqual(['native', 'off'])

    // A second event with nothing to change is not a second report.
    doc.fire()
    expect(modes).toEqual(['native', 'off'])
  })

  it('falls back to the expanded view when the browser refuses the request', async () => {
    const doc = new FakeDocument()
    const element = fakeElement(doc, 'refuses')
    const { controller, modes } = track(doc, element)
    await controller.enter()
    expect(controller.mode()).toBe('expanded')
    expect(modes).toEqual(['expanded'])
    // Leaving the fallback needs no call to the browser.
    await controller.exit()
    expect(controller.mode()).toBe('off')
    expect(doc.exitCalls).toBe(0)
  })

  it('falls back to the expanded view where there is no Fullscreen API for an element (an iPhone), or where the page may not use it', async () => {
    const noMethod = new FakeDocument()
    const a = track(noMethod, fakeElement(noMethod, 'missing'))
    expect(a.controller.native()).toBe(false)
    await a.controller.enter()
    expect(a.controller.mode()).toBe('expanded')

    const forbidden = new FakeDocument()
    forbidden.fullscreenEnabled = false
    const element = fakeElement(forbidden)
    const b = track(forbidden, element)
    expect(b.controller.native()).toBe(false)
    await b.controller.enter()
    expect(b.controller.mode()).toBe('expanded')
    expect(element.requestFullscreen).not.toHaveBeenCalled()

    const unknown = new FakeDocument()
    unknown.fullscreenEnabled = undefined
    const c = track(unknown, fakeElement(unknown))
    await c.controller.enter()
    expect(c.controller.mode()).toBe('expanded')
  })

  it('does nothing twice: entering while on, leaving while off', async () => {
    const doc = new FakeDocument()
    const element = fakeElement(doc)
    const { controller, modes } = track(doc, element)
    await controller.exit()
    expect(modes).toEqual([])
    await controller.enter()
    await controller.enter()
    expect(element.requestFullscreen).toHaveBeenCalledTimes(1)
    expect(modes).toEqual(['native'])
  })

  it('ignores another element\'s full screen', async () => {
    const doc = new FakeDocument()
    const element = fakeElement(doc)
    const { controller, modes } = track(doc, element)
    doc.fullscreenElement = {} as Element
    doc.fire()
    expect(controller.mode()).toBe('off')
    expect(modes).toEqual([])
  })

  it('cleans up: the listener goes, native full screen is left, and nothing is reported afterwards', async () => {
    const doc = new FakeDocument()
    const element = fakeElement(doc)
    const { controller, modes } = track(doc, element)
    expect(doc.listenerCount()).toBe(1)
    await controller.enter()

    controller.dispose()
    expect(doc.listenerCount()).toBe(0)
    expect(doc.exitCalls).toBe(1)
    expect(modes).toEqual(['native'])

    controller.dispose()
    expect(doc.exitCalls).toBe(1)
    await controller.enter()
    expect(modes).toEqual(['native'])
  })

  it('disposing while the expanded view is on leaves the browser alone', async () => {
    const doc = new FakeDocument()
    const { controller } = track(doc, fakeElement(doc, 'refuses'))
    await controller.enter()
    controller.dispose()
    expect(doc.exitCalls).toBe(0)
  })

  it('has its button named in every language, and says out loud what happened', () => {
    for (const lang of LANGUAGES) {
      const off = inLanguage(lang, createElement(LabFullscreen, { state: { mode: 'off', active: false, toggle: () => undefined, exit: () => undefined } }))
      const on = inLanguage(lang, createElement(LabFullscreen, { state: { mode: 'native', active: true, toggle: () => undefined, exit: () => undefined } }))
      expect(off, lang).toContain(`aria-label="${labText.fullscreen.enter[lang]}"`)
      expect(on, lang).toContain(`aria-label="${labText.fullscreen.exit[lang]}"`)
      expect(off, lang).toContain('role="status"')
      expect(labText.fullscreen.entered[lang].length).toBeGreaterThan(10)
      expect(labText.fullscreen.left[lang].length).toBeGreaterThan(10)
    }
  })

  it('is wired into every experience page, with Escape leaving the fallback and the page frozen behind it', () => {
    const frame = readFileSync(join(__dirname, 'ui', 'ExperimentFrame.tsx'), 'utf8')
    expect(frame).toContain('useFullscreen(frameRef)')
    expect(frame).toContain('<LabFullscreen state={fullscreen} />')
    const hook = readFileSync(join(__dirname, 'core', 'useFullscreen.ts'), 'utf8')
    expect(hook).toMatch(/event\.key === 'Escape'/)
    expect(hook).toContain('created.dispose()')
    const styles = readFileSync(join(__dirname, 'ui', 'ExperimentFrame.module.scss'), 'utf8')
    expect(styles).toContain("[data-fullscreen='expanded']")
    expect(styles).toContain('html[data-lab-expanded]')
  })
})

// ── The keyboard on the stage ───────────────────────────────────────────────

/** Lets the eased pointer arrive where the last key sent it. */
function settle(pointer: LabPointer, seconds = 5) {
  for (let i = 0; i < seconds * 60; i += 1) pointer.update(1 / 60)
}

describe('the keyboard on a stage', () => {
  it('moves the virtual pointer with the arrows, in the directions the arrows point', () => {
    const pointer = new LabPointer()
    pointer.setTarget(0, 0)
    expect(applyStageKey(pointer, 'ArrowRight', 0)).toBe(true)
    settle(pointer)
    expect(pointer.x).toBeGreaterThan(0.05)
    expect(applyStageKey(pointer, 'ArrowUp', 0)).toBe(true)
    settle(pointer)
    expect(pointer.y).toBeGreaterThan(0.05)
    const x = pointer.x
    applyStageKey(pointer, 'ArrowLeft', 0)
    settle(pointer)
    expect(pointer.x).toBeLessThan(x - 0.05)
    const y = pointer.y
    applyStageKey(pointer, 'ArrowDown', 0)
    settle(pointer)
    expect(pointer.y).toBeLessThan(y - 0.05)
    expect(pointer.touch).toBe(false)
  })

  it('brings the pointer back to the middle on Home, whatever the arrows did', () => {
    const pointer = new LabPointer()
    pointer.setTarget(0.2, 0.2)
    for (let i = 0; i < 6; i += 1) {
      applyStageKey(pointer, 'ArrowRight', 0)
      pointer.update(1 / 60)
    }
    for (let i = 0; i < 4; i += 1) {
      applyStageKey(pointer, 'ArrowUp', 0)
      pointer.update(1 / 60)
    }
    settle(pointer)
    expect(pointer.x).toBeGreaterThan(0.7)
    expect(pointer.y).toBeGreaterThan(0.5)
    expect(applyStageKey(pointer, 'Home', 0)).toBe(true)
    settle(pointer)
    expect(Math.abs(pointer.x)).toBeLessThan(0.01)
    expect(Math.abs(pointer.y)).toBeLessThan(0.01)
  })

  it('adds two keys pressed in the same frame instead of letting the second cancel the first', () => {
    const pointer = new LabPointer()
    pointer.setTarget(0, 0)
    applyStageKey(pointer, 'ArrowRight', 0)
    applyStageKey(pointer, 'ArrowUp', 0)
    applyStageKey(pointer, 'ArrowRight', 0)
    settle(pointer)
    expect(pointer.x).toBeCloseTo(0.2, 2)
    expect(pointer.y).toBeCloseTo(0.1, 2)
  })

  it('stands in for a click on Enter and Space, and leaves every other key alone', () => {
    const pointer = new LabPointer()
    pointer.setTarget(0.3, -0.2)
    const before = pointer.pulseVersion
    expect(applyStageKey(pointer, 'Enter', 4)).toBe(true)
    expect(applyStageKey(pointer, ' ', 5)).toBe(true)
    expect(pointer.pulseVersion).toBe(before + 2)
    for (const key of ['Tab', 'Escape', 'a', 'Shift', 'PageDown', 'F5']) expect(applyStageKey(pointer, key, 0), key).toBe(false)
    expect(pointer.pulseVersion).toBe(before + 2)
  })

  it('keeps the pointer inside the stage however long a key is held', () => {
    const pointer = new LabPointer()
    for (let i = 0; i < 400; i += 1) {
      applyStageKey(pointer, 'ArrowRight', 0)
      applyStageKey(pointer, 'ArrowUp', 0)
      pointer.update(1 / 60)
    }
    settle(pointer)
    expect(pointer.x).toBeLessThanOrEqual(1.4 + 1e-6)
    expect(pointer.y).toBeLessThanOrEqual(1.4 + 1e-6)
    expect(pointer.x).toBeGreaterThan(1)
  })

  it('is described, with Home and Escape, in every language', () => {
    for (const lang of LANGUAGES) {
      const text = labText.details.keyboard[lang]
      expect(text, lang).toMatch(/Home/)
      expect(text, lang).toMatch(/Esc/)
    }
  })
})

// ── The six experiences, and what each says it can do ───────────────────────

describe('the six experiences say how they are steered', () => {
  it('give every one of the six at least a pointer, a finger and the keyboard, and name the two that take words', () => {
    expect(playableExperiments.map((experiment) => experiment.id)).toEqual(SIX)
    for (const experiment of experiments) {
      for (const base of ['pointer', 'touch', 'keys'] as const) expect(experiment.inputs, `${experiment.id} ${base}`).toContain(base)
      expect(new Set(experiment.inputs).size, experiment.id).toBe(experiment.inputs.length)
    }
    const withWords = experiments.filter((experiment) => experiment.inputs.includes('text')).map((experiment) => experiment.id)
    expect(withWords).toEqual(['type-in-motion', 'generative-objects'])
  })

  it('has a word for every input in every language', () => {
    const inputs: LabInput[] = ['pointer', 'touch', 'keys', 'text']
    for (const input of inputs) {
      for (const lang of LANGUAGES) expect(pageText.discovery.inputs[input][lang].length, `${input} ${lang}`).toBeGreaterThan(2)
    }
    for (const lang of LANGUAGES) expect(pageText.discovery.inputsLabel[lang].length).toBeGreaterThan(5)
  })

  it('shows, on every tile in every language, that it is interactive and what steers it', () => {
    for (const lang of LANGUAGES) {
      const html = inLanguage(lang, createElement(Discovery))
      const tiles = html.split('<article').slice(1)
      expect(tiles, lang).toHaveLength(6)
      tiles.forEach((tile, index) => {
        const experiment = experiments[index]
        expect(tile, `${lang} ${experiment.id}`).toContain(`aria-label="${pageText.discovery.inputsLabel[lang]}"`)
        for (const input of experiment.inputs) expect(tile, `${lang} ${experiment.id} ${input}`).toContain(`>${pageText.discovery.inputs[input][lang]}<`)
        // No input is listed that the experiment does not have.
        const listed = (tile.match(/data-input="(\w+)"/g) ?? []).length
        expect(listed, `${lang} ${experiment.id}`).toBe(experiment.inputs.length)
      })
    }
  })

  it('has its way of using it in the panel of every experience, in every language, ahead of the controls', () => {
    for (const lang of LANGUAGES) {
      for (const id of SIX) {
        const html = inLanguage(lang, createElement(LabHelp, { id }))
        expect(html, `${lang} ${id}`).toContain('<details')
        expect(html).toContain(labText.help.title[lang])
        for (const interaction of experimentText[id].interactions) expect(html, `${lang} ${id}`).toContain(interaction[lang].replace(/&/g, '&amp;'))
        expect(html).toContain(labText.details.keyboard[lang])
      }
    }
    const frame = readFileSync(join(__dirname, 'ui', 'ExperimentFrame.tsx'), 'utf8')
    expect(frame.indexOf('<LabHelp id={id} />')).toBeLessThan(frame.indexOf('{panel}'))
  })
})

// ── Controls that are new ───────────────────────────────────────────────────

describe('Particle Universe: arrangements', () => {
  it('gives the same cloud for the same number, always, and another cloud for another number', () => {
    for (const shape of SHAPES) {
      const a = generateShape(shape, 400, 7)
      const b = generateShape(shape, 400, 7)
      const c = generateShape(shape, 400, 8)
      expect(Array.from(a), shape).toEqual(Array.from(b))
      expect(Array.from(a.slice(0, 30)), shape).not.toEqual(Array.from(c.slice(0, 30)))
    }
  })

  it('keeps arrangement zero exactly as the shapes always were, and keeps every arrangement in the box and finite', () => {
    for (const shape of SHAPES) {
      expect(Array.from(generateShape(shape, 300, 0)), shape).toEqual(Array.from(generateShape(shape, 300)))
      for (const arrangement of [0, 1, 50, ARRANGEMENTS - 1]) {
        const points = generateShape(shape, 600, arrangement)
        for (let i = 0; i < points.length; i += 3) {
          expect(Number.isFinite(points[i] + points[i + 1] + points[i + 2])).toBe(true)
          expect(Math.abs(points[i])).toBeLessThan(5.2)
          expect(Math.abs(points[i + 1])).toBeLessThan(4)
          expect(Math.abs(points[i + 2])).toBeLessThan(4.2)
        }
      }
    }
  })

  it('moves the particles to the new homes without a jump, and resets to arrangement zero', () => {
    const sim = new ParticleSim(1500, 'sphere')
    const start = Array.from(sim.positions.slice(0, 30))
    sim.setShape('sphere', 12)
    expect(sim.currentArrangement).toBe(12)
    // Nothing has moved yet: the springs carry the particles there over the next moments.
    expect(Array.from(sim.positions.slice(0, 30))).toEqual(start)
    for (let i = 0; i < 240; i += 1) sim.step(1 / 60, { x: 0, y: 0, vx: 0, vy: 0, presence: 0, sign: 1, strength: 1, radius: 1.7, time: i / 60, ambient: 0 }, null)
    expect(sim.disorder()).toBeLessThan(0.05)
    sim.setShape('sphere', PARTICLE_DEFAULTS.arrangement)
    expect(sim.currentArrangement).toBe(0)
  })

  it('starts the panel on the original arrangement and offers a range the generator accepts', () => {
    expect(PARTICLE_DEFAULTS.arrangement).toBe(0)
    expect(ARRANGEMENTS).toBe(100)
    expect(particleTextHas('arrangement')).toBe(true)
  })
})

function particleTextHas(key: string): boolean {
  const source = readFileSync(join(__dirname, 'experiments', 'particles', 'particleControls.ts'), 'utf8')
  return source.includes(`${key}: tri(`)
}

describe('Chromatic Distortion: modes', () => {
  it('offers three modes, starts on the original look, and names each in every language with a description', () => {
    expect(CHROMATIC_MODES).toEqual(['mixed', 'linear', 'radial'])
    expect(CHROMATIC_DEFAULTS.mode).toBe('mixed')
    for (const mode of CHROMATIC_MODES) {
      for (const lang of LANGUAGES) {
        expect(chromaticText.modes[mode][lang].length, `${mode} ${lang}`).toBeGreaterThan(2)
        expect(chromaticText.modeHelp[mode][lang].length, `${mode} ${lang}`).toBeGreaterThan(20)
      }
    }
    const names = new Set(CHROMATIC_MODES.map((mode) => chromaticText.modes[mode].en))
    expect(names.size).toBe(3)
  })

  it('hands the shader the mode as an index the shader reads in the same order', () => {
    expect(CHROMATIC_FRAGMENT).toContain('uMode')
    expect(CHROMATIC_FRAGMENT).toMatch(/step\(0\.5, uMode\)/)
    expect(CHROMATIC_FRAGMENT).toMatch(/step\(1\.5, uMode\)/)
    const scene = readFileSync(join(__dirname, 'experiments', 'chromatic', 'ChromaticScene.tsx'), 'utf8')
    expect(scene).toContain('CHROMATIC_MODES.indexOf(ctl.mode)')
    expect(CHROMATIC_MODES.indexOf('mixed')).toBe(0)
    expect(CHROMATIC_MODES.indexOf('linear')).toBe(1)
    expect(CHROMATIC_MODES.indexOf('radial')).toBe(2)
  })

  it('keeps the unchanged mode exactly the shader\'s old offset (a drift plus a lens), so the original look is untouched', () => {
    // mixed: directional = 0 and outward = 0, so axis = drift, global x 1, local x 1.
    expect(CHROMATIC_FRAGMENT).toContain('vec2 axis = mix(drift, radial, outward);')
    expect(CHROMATIC_FRAGMENT).toContain('axis * global * (1.0 + 0.5 * directional) + radial * local * (1.0 - directional)')
  })

  it('does not distort the page: the effect is one canvas, and no text of the page is drawn in it', () => {
    const scene = readFileSync(join(__dirname, 'experiments', 'chromatic', 'ChromaticScene.tsx'), 'utf8')
    expect(scene).not.toMatch(/CanvasTexture|fillText|document\./)
  })
})

describe('Infinite Space: a look that stays', () => {
  it('turns the view with a drag in the direction of the drag, and never past the limits', () => {
    const right = lookAfterDrag({ yaw: 0, pitch: 0 }, 0.5, 0)
    expect(right.yaw).toBeLessThan(0)
    expect(right.pitch).toBe(0)
    const up = lookAfterDrag({ yaw: 0, pitch: 0 }, 0, 0.5)
    expect(up.pitch).toBeGreaterThan(0)

    let look = { yaw: 0, pitch: 0 }
    for (let i = 0; i < 100; i += 1) look = lookAfterDrag(look, 2, 2)
    expect(look.yaw).toBeCloseTo(-LOOK.yawMax, 6)
    expect(look.pitch).toBeCloseTo(LOOK.pitchMax, 6)
    for (let i = 0; i < 100; i += 1) look = lookAfterDrag(look, -2, -2)
    expect(look.yaw).toBeCloseTo(LOOK.yawMax, 6)
    expect(look.pitch).toBeCloseTo(-LOOK.pitchMax, 6)
  })

  it('keeps the view inside a cone the tunnel still reads in, and turns it gently', () => {
    expect(LOOK.yawMax).toBeLessThanOrEqual(1.05)
    expect(LOOK.pitchMax).toBeLessThanOrEqual(0.6)
    // A drag across the whole stage (2 stage units) is a turn of at most about 70 degrees.
    expect(LOOK.yawPerUnit * 2).toBeLessThan((75 * Math.PI) / 180)
  })

  it('does not move on a zero drag, and does not invent a turn from nothing', () => {
    expect(lookAfterDrag({ yaw: 0.3, pitch: -0.2 }, 0, 0)).toEqual({ yaw: 0.3, pitch: -0.2 })
  })

  it('has a way back to straight ahead, named in every language, and Reset brings it too', () => {
    for (const lang of LANGUAGES) expect(spaceText.recentre[lang].length).toBeGreaterThan(5)
    expect(SPACE_DEFAULTS.recentreVersion).toBe(0)
    const panel = readFileSync(join(__dirname, 'experiments', 'space', 'InfiniteSpace.tsx'), 'utf8')
    // The dedicated button, and the reset: both bump the version the scene watches.
    expect(panel.match(/recentreVersion: controls\.current\.recentreVersion \+ 1/g)).toHaveLength(2)
  })

  it('says in every language that a drag looks around and Home recentres', () => {
    for (const lang of LANGUAGES) expect(spaceText.steer[lang], lang).toMatch(/Home/)
  })
})

describe('Generative Objects: a seed that can be typed, and a way back', () => {
  it('reads a typed seed only when it is a whole number the generator accepts', () => {
    expect(parseSeed('0')).toBe(0)
    expect(parseSeed('42')).toBe(42)
    expect(parseSeed(' 1234567 ')).toBe(1234567)
    expect(parseSeed(String(MAX_SEED))).toBe(MAX_SEED)
    for (const bad of ['', ' ', '-1', '1.5', '1e3', 'abc', '12a', String(MAX_SEED + 1), '99999999999', '０１']) expect(parseSeed(bad), bad).toBeNull()
  })

  it('builds the same description with the same seed, and the start is the same every time', () => {
    for (const lang of LANGUAGES) {
      const a = startControls(lang)
      const b = startControls(lang)
      expect(a.seed, lang).toBe(b.seed)
      expect(a.text, lang).toBe(b.text)
      expect(makeFrom(a.text, a).seed, lang).toBe(a.seed)
    }
  })

  it('shows what is being typed until something else changes the seed, then the seed itself', () => {
    expect(seedFieldText(null, 5)).toBe('5')
    expect(seedFieldText('007', 7)).toBe('007')
    expect(seedFieldText('7x', 7)).toBe('7x')
    expect(seedFieldText('', 7)).toBe('')
    // Another version (or a new description) moved the seed: the field follows, a stale typed number does not stay.
    expect(seedFieldText('12', 99)).toBe('99')
  })

  it('has the seed field, its help and a reset in the panel, in every language, and still no AI', () => {
    for (const lang of LANGUAGES) {
      expect(generativeText.seed[lang].length).toBeGreaterThan(3)
      expect(generativeText.seedHelp[lang]).toMatch(/seed|mag/i)
    }
    const panel = readFileSync(join(__dirname, 'experiments', 'generative', 'GenerativeObjects.tsx'), 'utf8')
    expect(panel).toContain('<LabAction onClick={reset}>{text.panel.reset}</LabAction>')
    expect(panel).toContain('parseSeed(text)')
    expect(panel).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket|anthropic|openai/i)
  })
})

// ── The controls every panel is built from ──────────────────────────────────

describe('the panel controls are real, labelled form controls', () => {
  it('give every slider a label and a value, every choice a legend and radios, every switch its role, and every action a button type', () => {
    for (const lang of LANGUAGES) {
      const words = { group: 'Group', slider: 'Slider label', choice: 'Choice label', optionA: 'Option A', helpA: 'What A does', optionB: 'Option B', toggle: 'Toggle label', action: 'Do it' }
      const html = inLanguage(lang, createElement(LabControlsDemo, { words }))
      expect(html).toMatch(/<label[^>]*for="[^"]+"[^>]*>Slider label<\/label>/)
      expect(html).toMatch(/<output[^>]*for="[^"]+"[^>]*>42%<\/output>/)
      expect(html).toContain('aria-valuetext="42%"')
      expect(html).toContain('<legend')
      expect(html).toContain('type="radio"')
      expect(html).toContain('role="switch"')
      expect(html).toMatch(/<button type="button"[^>]*>Do it<\/button>/)
      // A choice's help is read out, not only a tooltip.
      expect(html).toContain('visually-hidden')
    }
  })
})

describe('the shell draws what the panel changes, and brings the canvas up in every view', () => {
  it('asks the stage for a frame on any input, change or click in the panel (the Calm view draws only when asked)', () => {
    const frame = readFileSync(join(__dirname, 'ui', 'ExperimentFrame.tsx'), 'utf8')
    // On the panel's existing container: a wrapper of its own would change the layout (the panel's width and place are the container's).
    expect(frame).toContain('<div className={styles.side} onInputCapture={wake} onChangeCapture={wake} onClickCapture={wake}>')
    expect(frame).toContain('stagePointer.current?.onActivity?.()')
    expect(frame).toContain('pointerRef={stagePointer}')
  })

  it('draws the first frames of an on-demand canvas without being asked, so the Calm view is shown even when nothing touches it', () => {
    const canvas = readFileSync(join(__dirname, 'core', 'LabScene.tsx'), 'utf8')
    expect(canvas).toContain('const READY_FRAMES = 2')
    expect(canvas).toContain('if (clock.frame < READY_FRAMES + 1) invalidate()')
    expect(canvas).toContain('if (clock.frame === READY_FRAMES) onReady()')
  })
})

describe('no experience is left out of the cleanup rules', () => {
  it('every experience mounts one stage and nothing else that renders by itself', () => {
    for (const id of SIX) {
      const folder = id === 'particle-universe' ? 'particles' : id === 'liquid-matter' ? 'liquid' : id === 'type-in-motion' ? 'type' : id === 'infinite-space' ? 'space' : id === 'chromatic-distortion' ? 'chromatic' : 'generative'
      const dir = join(__dirname, 'experiments', folder)
      const sources = ['ParticleUniverse', 'LiquidMatter', 'TypeInMotion', 'InfiniteSpace', 'ChromaticDistortion', 'GenerativeObjects']
        .map((name) => join(dir, `${name}.tsx`))
        .filter((file) => {
          try {
            readFileSync(file)
            return true
          } catch {
            return false
          }
        })
      expect(sources, id).toHaveLength(1)
      const text = readFileSync(sources[0], 'utf8')
      // The one shared frame owns the canvas, the loop, the listeners and the way out.
      expect(text, id).toContain('<ExperimentFrame')
      expect(text, id).not.toMatch(/requestAnimationFrame|new WebGLRenderer|addEventListener\(/)
    }
  })
})
