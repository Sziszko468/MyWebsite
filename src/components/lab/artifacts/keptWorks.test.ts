import { beforeEach, describe, expect, it } from 'vitest'
import { createHandoff } from '../experience/handoff'
import { HOME, openArtifact } from './artifactActions'
import {
  ARTIFACT_TYPES,
  LIMITS,
  createMemoryBackend,
  createService,
  parseArtifact,
  type Artifact,
  type ArtifactType,
} from './artifactDb'
import {
  LIQUID_DEFAULTS,
  LIQUID_RANGES,
  liquidHandoff,
  materialWork,
  sanitizeMaterialWork,
} from '../experiments/liquid/liquidControls'
import { MATTERS } from '../experiments/liquid/liquidMaterials'
import { FONTS, MOTIONS, TYPE_DEFAULTS, TYPE_RANGES, sanitizeTypeWork, typeHandoff, typeWork } from '../experiments/type/typeControls'
import { MAX_LETTERS, PHRASES } from '../experiments/type/typeLayout'

const artifact = (type: ArtifactType, payload: Record<string, unknown>): Artifact => ({
  id: `${type}-test`,
  type,
  name: 'Test',
  createdAt: 1,
  updatedAt: 1,
  payload,
})

beforeEach(() => {
  typeHandoff.clear()
  liquidHandoff.clear()
})

describe('a typography artwork', () => {
  it('keeps the words and everything that shapes them, and reads back what it wrote', () => {
    const controls = {
      ...TYPE_DEFAULTS,
      text: 'HELLO WORLD',
      font: 'serif' as const,
      size: 0.7,
      colour: '#ff00aa',
      motion: 'wave' as const,
      speed: 1.6,
      depth: 0.2,
      distortion: 1.3,
      broken: true,
      scatterVersion: 9,
    }
    const work = typeWork(controls)
    expect(Object.keys(work).sort()).toEqual(['broken', 'colour', 'depth', 'distortion', 'font', 'motion', 'size', 'speed', 'text', 'version'])
    const back = sanitizeTypeWork(JSON.parse(JSON.stringify(work)))
    expect(back).toMatchObject({ text: 'HELLO WORLD', font: 'serif', size: 0.7, colour: '#ff00aa', motion: 'wave', speed: 1.6, depth: 0.2, distortion: 1.3, broken: true })
    // What is a moment of the performance (a scatter in progress) is not kept.
    expect(back?.scatterVersion).toBe(0)
    expect(back?.resetVersion).toBe(0)
  })

  it('still reads a work made when the page had three sentences to choose from', () => {
    const old = sanitizeTypeWork({ version: 1, phrase: 1, depth: 0.1, distortion: 0.5, broken: true })!
    expect(old.text).toBe(PHRASES[1].lines.join(' '))
    expect(old).toMatchObject({ depth: 0.1, distortion: 0.5, broken: true, motion: 'none' })
  })

  it('refuses what is not one', () => {
    for (const raw of [
      null,
      undefined,
      'x',
      4,
      [],
      {},
      { version: 3, text: 'A' },
      { version: 2 },
      { version: 2, text: '' },
      { version: 2, text: '   ' },
      { version: 2, text: 5 },
      { version: 1 },
      { version: 1, phrase: -1 },
      { version: 1, phrase: PHRASES.length },
      { version: 1, phrase: 1.5 },
      { version: 1, phrase: NaN },
      { version: 1, phrase: '1' },
    ])
      expect(sanitizeTypeWork(raw), JSON.stringify(raw)).toBeNull()
  })

  it('clamps the numbers, makes the words safe to set and keeps only a font, a motion and a colour the page has', () => {
    const wild = sanitizeTypeWork({
      version: 2,
      text: '  <b>hello</b>   wörld \u0000 \n and a very very long sentence that goes on and on and on  ',
      font: 'comic',
      motion: 'explode',
      colour: 'red',
      size: 99,
      speed: -4,
      depth: 99,
      distortion: -5,
      broken: 'yes',
      extra: { a: 1 },
    })!
    // eslint-disable-next-line no-control-regex
    expect(wild.text).not.toMatch(/[<>\u0000\n]/)
    expect(wild.text).toBe(wild.text.toUpperCase())
    expect(wild.text.replace(/ /g, '').length).toBeLessThanOrEqual(MAX_LETTERS)
    expect(wild.font).toBe(TYPE_DEFAULTS.font)
    expect(wild.motion).toBe(TYPE_DEFAULTS.motion)
    expect(wild.colour).toBeNull()
    expect(wild.size).toBe(TYPE_RANGES.size.max)
    expect(wild.speed).toBe(TYPE_RANGES.speed.min)
    expect(wild.depth).toBe(TYPE_RANGES.depth.max)
    expect(wild.distortion).toBe(TYPE_RANGES.distortion.min)
    expect(wild.broken).toBe(false)
    expect('extra' in wild).toBe(false)
    const nan = sanitizeTypeWork({ version: 2, text: 'A', depth: NaN, distortion: Infinity })!
    expect(nan.depth).toBe(TYPE_DEFAULTS.depth)
    expect(nan.distortion).toBe(TYPE_DEFAULTS.distortion)
  })
})

describe('a material preset', () => {
  it('keeps the state of matter and its three settings, and reads back what it wrote', () => {
    for (const matter of MATTERS) {
      const controls = { ...LIQUID_DEFAULTS, matter, deformation: 1.4, flow: 0.25, light: 0.9, pulseVersion: 5 }
      const back = sanitizeMaterialWork(JSON.parse(JSON.stringify(materialWork({ ...controls, tint: '#33aaff' }))))
      expect(back).toMatchObject({ matter, deformation: 1.4, flow: 0.25, light: 0.9, tint: '#33aaff' })
      expect(back?.pulseVersion).toBe(0)
    }
  })

  it('refuses what is not one', () => {
    for (const raw of [
      null,
      'x',
      [],
      {},
      { version: 1 },
      { version: 1, matter: 'plasma' },
      { version: 3, matter: 'glass' },
      { version: 0, matter: 'glass' },
    ])
      expect(sanitizeMaterialWork(raw), JSON.stringify(raw)).toBeNull()
  })

  it('reads version 1 (no colour) and refuses a colour that is not #rrggbb', () => {
    expect(sanitizeMaterialWork({ version: 1, matter: 'soft', tint: '#ff0000' })!.tint).toBeNull()
    for (const tint of ['red', '#fff', '#ggg000', 7, null, '#ff0000; background: url(x)']) {
      expect(sanitizeMaterialWork({ version: 2, matter: 'soft', tint })!.tint, String(tint)).toBeNull()
    }
  })

  it('clamps the numbers to the panel and ignores everything else', () => {
    const wild = sanitizeMaterialWork({
      version: 2,
      matter: 'glass',
      deformation: 50,
      flow: -1,
      light: 'bright',
      x: 1,
    })!
    expect(wild.deformation).toBe(LIQUID_RANGES.deformation.max)
    expect(wild.flow).toBe(LIQUID_RANGES.flow.min)
    expect(wild.light).toBe(LIQUID_DEFAULTS.light)
    expect('x' in wild).toBe(false)
  })
})

describe('whatever is thrown at the readers', () => {
  it('never throws, and anything it accepts is inside the panel’s ranges', () => {
    const pool: unknown[] = [0, 1, -1, 1e9, -1e9, NaN, Infinity, null, undefined, 'a', true, {}, [], 0.5]
    let state = 12345
    const pick = () => {
      state = (state * 1103515245 + 12345) & 0x7fffffff
      return pool[state % pool.length]
    }
    for (let i = 0; i < 400; i++) {
      const raw = {
        version: i % 5 === 0 ? pick() : 2,
        phrase: pick(),
        text: pick(),
        font: pick(),
        motion: pick(),
        colour: pick(),
        tint: pick(),
        size: pick(),
        speed: pick(),
        matter: MATTERS[i % 5] ?? pick(),
        depth: pick(),
        distortion: pick(),
        broken: pick(),
        deformation: pick(),
        flow: pick(),
        light: pick(),
      }
      const t = sanitizeTypeWork(raw)
      if (t) {
        expect(t.text.length).toBeGreaterThan(0)
        expect(FONTS).toContain(t.font)
        expect(MOTIONS).toContain(t.motion)
        expect(t.size).toBeGreaterThanOrEqual(TYPE_RANGES.size.min)
        expect(t.size).toBeLessThanOrEqual(TYPE_RANGES.size.max)
        expect(t.colour === null || /^#[0-9a-f]{6}$/.test(t.colour)).toBe(true)
        expect(t.depth).toBeGreaterThanOrEqual(TYPE_RANGES.depth.min)
        expect(t.depth).toBeLessThanOrEqual(TYPE_RANGES.depth.max)
        expect(t.distortion).toBeGreaterThanOrEqual(TYPE_RANGES.distortion.min)
        expect(t.distortion).toBeLessThanOrEqual(TYPE_RANGES.distortion.max)
      }
      const m = sanitizeMaterialWork(raw)
      if (m) {
        expect(MATTERS).toContain(m.matter)
        for (const key of ['deformation', 'flow', 'light'] as const) {
          expect(m[key]).toBeGreaterThanOrEqual(LIQUID_RANGES[key].min)
          expect(m[key]).toBeLessThanOrEqual(LIQUID_RANGES[key].max)
        }
      }
    }
  })
})

describe('the store keeps them', () => {
  it('knows exactly the two kinds of work the experiences keep, and each has a home experience', () => {
    expect([...ARTIFACT_TYPES].sort()).toEqual(['material', 'typography'])
    expect(HOME.typography).toBe('type-in-motion')
    expect(HOME.material).toBe('liquid-matter')
    for (const type of ARTIFACT_TYPES) expect(HOME[type], type).toBeTruthy()
    expect(parseArtifact({ ...artifact('typography', { version: 1 }) })?.type).toBe('typography')
    expect(parseArtifact({ ...artifact('material', { version: 1 }) })?.type).toBe('material')
    expect(parseArtifact({ ...artifact('typography', {}), type: 'sculpture' })).toBeNull()
    for (const removed of ['model', 'track', 'setup', 'artwork'])
      expect(parseArtifact({ ...artifact('typography', {}), type: removed }), removed).toBeNull()
  })

  it('saves, lists, renames and removes one, with its preview', async () => {
    const service = createService(createMemoryBackend(), () => 1000)
    const thumbnail = 'data:image/png;base64,iVBORw0KGgo='
    const saved = await service.save({
      type: 'typography',
      name: 'CREATE 31/10/2026, 22:10',
      payload: typeWork({ ...TYPE_DEFAULTS, text: 'CREATE WITHOUT LIMITS.', broken: true }) as unknown as Record<string, unknown>,
      thumbnail,
    })
    expect(saved.ok).toBe(true)
    const kept = await service.list()
    expect(kept).toHaveLength(1)
    expect(kept[0]).toMatchObject({ type: 'typography', thumbnail })
    expect(await service.rename(kept[0].id, 'My poster')).toBe(true)
    expect((await service.list())[0].name).toBe('My poster')
    expect(await service.remove(kept[0].id)).toBe(true)
    expect(await service.list()).toHaveLength(0)
  })

  it('keeps a work without a picture (the still view has none)', async () => {
    const service = createService(createMemoryBackend())
    const saved = await service.save({
      type: 'material',
      name: 'Glass',
      payload: materialWork({ ...LIQUID_DEFAULTS, matter: 'glass' }) as unknown as Record<string, unknown>,
    })
    expect(saved.ok).toBe(true)
    expect((await service.list())[0].thumbnail).toBeUndefined()
  })

  it('says why it cannot: too large, or a hundred works already', async () => {
    const service = createService(createMemoryBackend())
    const huge = await service.save({
      type: 'typography',
      name: 'x',
      payload: { version: 2, junk: 'x'.repeat(LIMITS.payload) },
    })
    expect(huge).toEqual({ ok: false, reason: 'too-large' })
    for (let i = 0; i < LIMITS.artifacts; i++)
      await service.save({ id: `m${i}`, type: 'material', name: `m${i}`, payload: { version: 1, matter: 'chrome' } })
    const over = await service.save({ type: 'material', name: 'one more', payload: { version: 1, matter: 'soft' } })
    expect(over).toEqual({ ok: false, reason: 'full' })
  })
})

describe('opening a kept work', () => {
  it('hands a typography artwork to its experience, checked and clamped', async () => {
    const target = await openArtifact(
      artifact('typography', { version: 2, text: 'make it so', font: 'mono', depth: 0.1, distortion: 9, broken: true }),
    )
    expect(target).toBe('type-in-motion')
    expect(typeHandoff.peek()).toMatchObject({
      text: 'MAKE IT SO',
      font: 'mono',
      depth: 0.1,
      distortion: TYPE_RANGES.distortion.max,
      broken: true,
    })
    expect(liquidHandoff.peek()).toBeNull()
  })

  it('hands a material preset to its experience', async () => {
    const target = await openArtifact(
      artifact('material', { version: 2, matter: 'molten', deformation: 1.5, flow: 0, light: 1.2, tint: '#00ffaa' }),
    )
    expect(target).toBe('liquid-matter')
    expect(liquidHandoff.peek()).toMatchObject({ matter: 'molten', deformation: 1.5, flow: 0, light: 1.2, tint: '#00ffaa' })
    expect(typeHandoff.peek()).toBeNull()
  })

  it('refuses a damaged one and hands nothing over', async () => {
    expect(await openArtifact(artifact('typography', { version: 2, text: '' }))).toBeNull()
    expect(await openArtifact(artifact('typography', { text: 'A' }))).toBeNull()
    expect(await openArtifact(artifact('material', { version: 1, matter: 'plasma' }))).toBeNull()
    expect(await openArtifact(artifact('material', {}))).toBeNull()
    expect(typeHandoff.peek()).toBeNull()
    expect(liquidHandoff.peek()).toBeNull()
  })

  it('replaces an earlier handoff, so the page opens the work that was chosen last', async () => {
    await openArtifact(artifact('typography', { version: 2, text: 'first' }))
    await openArtifact(artifact('typography', { version: 2, text: 'second' }))
    expect(typeHandoff.peek()?.text).toBe('SECOND')
  })
})

describe('the handoff slot', () => {
  it('is read without being emptied, and emptied on purpose', () => {
    const slot = createHandoff<{ n: number }>()
    expect(slot.peek()).toBeNull()
    slot.put({ n: 1 })
    expect(slot.peek()).toEqual({ n: 1 })
    expect(slot.peek()).toEqual({ n: 1 })
    slot.clear()
    expect(slot.peek()).toBeNull()
  })
})
