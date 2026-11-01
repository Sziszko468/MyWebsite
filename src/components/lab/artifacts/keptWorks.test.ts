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
import { TYPE_DEFAULTS, TYPE_RANGES, sanitizeTypeWork, typeHandoff, typeWork } from '../experiments/type/typeControls'
import { PHRASES } from '../experiments/type/typeLayout'

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
  it('keeps the sentence and its three settings, and reads back what it wrote', () => {
    const controls = { ...TYPE_DEFAULTS, phrase: 2, depth: 0.2, distortion: 1.3, broken: true, scatterVersion: 9 }
    const work = typeWork(controls)
    expect(Object.keys(work).sort()).toEqual(['broken', 'depth', 'distortion', 'phrase', 'version'])
    const back = sanitizeTypeWork(JSON.parse(JSON.stringify(work)))
    expect(back).toMatchObject({ phrase: 2, depth: 0.2, distortion: 1.3, broken: true })
    // What is a moment of the performance (a scatter in progress) is not kept.
    expect(back?.scatterVersion).toBe(0)
    expect(back?.resetVersion).toBe(0)
  })

  it('refuses what is not one', () => {
    for (const raw of [
      null,
      undefined,
      'x',
      4,
      [],
      {},
      { version: 2, phrase: 0 },
      { version: 1 },
      { version: 1, phrase: -1 },
      { version: 1, phrase: PHRASES.length },
      { version: 1, phrase: 1.5 },
      { version: 1, phrase: NaN },
      { version: 1, phrase: '1' },
    ])
      expect(sanitizeTypeWork(raw), JSON.stringify(raw)).toBeNull()
  })

  it('clamps the numbers to what the panel allows and defaults the rest', () => {
    const wild = sanitizeTypeWork({ version: 1, phrase: 0, depth: 99, distortion: -5, broken: 'yes', extra: { a: 1 } })!
    expect(wild.depth).toBe(TYPE_RANGES.depth.max)
    expect(wild.distortion).toBe(TYPE_RANGES.distortion.min)
    expect(wild.broken).toBe(false)
    expect('extra' in wild).toBe(false)
    const bare = sanitizeTypeWork({ version: 1, phrase: 1 })!
    expect(bare.depth).toBe(TYPE_DEFAULTS.depth)
    expect(bare.distortion).toBe(TYPE_DEFAULTS.distortion)
    const nan = sanitizeTypeWork({ version: 1, phrase: 0, depth: NaN, distortion: Infinity })!
    expect(nan.depth).toBe(TYPE_DEFAULTS.depth)
    expect(nan.distortion).toBe(TYPE_DEFAULTS.distortion)
  })
})

describe('a material preset', () => {
  it('keeps the state of matter and its three settings, and reads back what it wrote', () => {
    for (const matter of MATTERS) {
      const controls = { ...LIQUID_DEFAULTS, matter, deformation: 1.4, flow: 0.25, light: 0.9, pulseVersion: 5 }
      const back = sanitizeMaterialWork(JSON.parse(JSON.stringify(materialWork(controls))))
      expect(back).toMatchObject({ matter, deformation: 1.4, flow: 0.25, light: 0.9 })
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
    ])
      expect(sanitizeMaterialWork(raw), JSON.stringify(raw)).toBeNull()
  })

  it('clamps the numbers to the panel and ignores everything else', () => {
    const wild = sanitizeMaterialWork({
      version: 1,
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
        version: i % 5 === 0 ? pick() : 1,
        phrase: pick(),
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
        expect(t.phrase).toBeGreaterThanOrEqual(0)
        expect(t.phrase).toBeLessThan(PHRASES.length)
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
  it('knows the two new kinds of work, and each has a home experience', () => {
    expect(ARTIFACT_TYPES).toEqual(expect.arrayContaining(['typography', 'material']))
    expect(HOME.typography).toBe('type-in-motion')
    expect(HOME.material).toBe('liquid-matter')
    for (const type of ARTIFACT_TYPES) expect(HOME[type], type).toBeTruthy()
    expect(parseArtifact({ ...artifact('typography', { version: 1 }) })?.type).toBe('typography')
    expect(parseArtifact({ ...artifact('material', { version: 1 }) })?.type).toBe('material')
    expect(parseArtifact({ ...artifact('typography', {}), type: 'sculpture' })).toBeNull()
  })

  it('saves, lists, renames and removes one, with its preview', async () => {
    const service = createService(createMemoryBackend(), () => 1000)
    const thumbnail = 'data:image/png;base64,iVBORw0KGgo='
    const saved = await service.save({
      type: 'typography',
      name: 'CREATE 31/10/2026, 22:10',
      payload: typeWork({ ...TYPE_DEFAULTS, broken: true }) as unknown as Record<string, unknown>,
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
      payload: { version: 1, junk: 'x'.repeat(LIMITS.payload) },
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
      artifact('typography', { version: 1, phrase: 1, depth: 0.1, distortion: 9, broken: true }),
    )
    expect(target).toBe('type-in-motion')
    expect(typeHandoff.peek()).toMatchObject({
      phrase: 1,
      depth: 0.1,
      distortion: TYPE_RANGES.distortion.max,
      broken: true,
    })
    expect(liquidHandoff.peek()).toBeNull()
  })

  it('hands a material preset to its experience', async () => {
    const target = await openArtifact(
      artifact('material', { version: 1, matter: 'molten', deformation: 1.5, flow: 0, light: 1.2 }),
    )
    expect(target).toBe('liquid-matter')
    expect(liquidHandoff.peek()).toMatchObject({ matter: 'molten', deformation: 1.5, flow: 0, light: 1.2 })
    expect(typeHandoff.peek()).toBeNull()
  })

  it('refuses a damaged one and hands nothing over', async () => {
    expect(await openArtifact(artifact('typography', { version: 1, phrase: 99 }))).toBeNull()
    expect(await openArtifact(artifact('typography', { phrase: 0 }))).toBeNull()
    expect(await openArtifact(artifact('material', { version: 1, matter: 'plasma' }))).toBeNull()
    expect(await openArtifact(artifact('material', {}))).toBeNull()
    expect(typeHandoff.peek()).toBeNull()
    expect(liquidHandoff.peek()).toBeNull()
  })

  it('replaces an earlier handoff, so the page opens the work that was chosen last', async () => {
    await openArtifact(artifact('typography', { version: 1, phrase: 0 }))
    await openArtifact(artifact('typography', { version: 1, phrase: 2 }))
    expect(typeHandoff.peek()?.phrase).toBe(2)
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
