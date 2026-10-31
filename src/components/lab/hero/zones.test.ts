import { beforeEach, describe, expect, it } from 'vitest'
import { experiments, isPlayable } from '../../../content/lab'
import {
  OPEN_SECONDS,
  ZONE_IDS,
  activate,
  autoPlacement,
  beginOpening,
  hitZone,
  isPlainClick,
  isZone,
  openingProgress,
  release,
  resetZones,
  resolveTap,
  rowPlacement,
  zoneStore,
  type Anchor,
} from './zones'

beforeEach(() => resetZones())

describe('the four zones', () => {
  it('are the four applications of the Lab, each of them playable, in the Lab order', () => {
    expect(ZONE_IDS).toHaveLength(4)
    const numbers = ZONE_IDS.map((id) => {
      const found = experiments.find((experiment) => experiment.id === id)
      expect(found, id).toBeDefined()
      expect(isPlayable(found!), id).toBe(true)
      expect(found!.kind).toBe('experience')
      return Number(found!.number)
    })
    expect([...numbers].sort((a, b) => a - b)).toEqual(numbers)
    expect(ZONE_IDS.every(isZone)).toBe(true)
    expect(isZone('generative-art')).toBe(false)
  })
})

describe('which zone is awake', () => {
  it('follows the pointer, the links and the keyboard, each giving up only what it set', () => {
    activate('racing', 'hover')
    expect(zoneStore.get().active).toBe('racing')
    release('focus')
    expect(zoneStore.get().active).toBe('racing')
    activate('track-architect', 'focus')
    expect(zoneStore.get().active).toBe('track-architect')
    release('hover')
    expect(zoneStore.get().active).toBe('track-architect')
    release('focus')
    expect(zoneStore.get().active).toBeNull()
    expect(zoneStore.get().source).toBeNull()
  })

  it('does not notify when nothing changes', () => {
    let calls = 0
    const stop = zoneStore.subscribe(() => calls++)
    activate('racing', 'hover')
    activate('racing', 'hover')
    release('link')
    expect(calls).toBe(1)
    stop()
  })

  it('freezes once a zone is being entered', () => {
    activate('model-studio', 'hover')
    beginOpening('model-studio')
    activate('racing', 'hover')
    release('hover')
    beginOpening('performance-lab')
    expect(zoneStore.get()).toMatchObject({ active: 'model-studio', opening: 'model-studio' })
    resetZones()
    expect(zoneStore.get()).toEqual({ active: null, source: null, opening: null })
  })
})

describe('what a click or a tap does', () => {
  it('opens at once with a mouse', () => {
    expect(resolveTap({ active: null, source: null }, 'racing', false)).toEqual({ kind: 'open', zone: 'racing' })
    expect(resolveTap({ active: 'model-studio', source: 'hover' }, 'racing', false)).toEqual({
      kind: 'open',
      zone: 'racing',
    })
  })

  it('selects first and opens second with a finger', () => {
    expect(resolveTap({ active: null, source: null }, 'racing', true)).toEqual({ kind: 'select', zone: 'racing' })
    expect(resolveTap({ active: 'model-studio', source: 'tap' }, 'racing', true)).toEqual({
      kind: 'select',
      zone: 'racing',
    })
    expect(resolveTap({ active: 'racing', source: 'tap' }, 'racing', true)).toEqual({ kind: 'open', zone: 'racing' })
  })

  it('gives up a selection made by tapping when empty space is tapped, and nothing else', () => {
    expect(resolveTap({ active: 'racing', source: 'tap' }, null, true)).toEqual({ kind: 'clear' })
    expect(resolveTap({ active: 'racing', source: 'focus' }, null, true)).toEqual({ kind: 'none' })
    expect(resolveTap({ active: null, source: null }, null, false)).toEqual({ kind: 'none' })
  })
})

describe('where the zones stand', () => {
  const stage = { left: 0, top: 0, width: 1440, height: 900 }
  const centres = [180, 540, 900, 1260]

  it('stand over their links, in order, inside the free band', () => {
    const places = rowPlacement(stage, centres, 300, 640)!
    expect(places).toHaveLength(4)
    expect(places.map((p) => p.x)).toEqual([...places.map((p) => p.x)].sort((a, b) => a - b))
    // 180 px left of the stage's centre (720) is 540 px = 1.2 half-heights.
    expect(places[0].x).toBeCloseTo((180 - 720) / 450)
    expect(places[3].x).toBeCloseTo((1260 - 720) / 450)
    // The band's middle is 470 px down; the stage's middle is 450 px down.
    for (const p of places) expect(p.y).toBeCloseTo((450 - 470) / 450)
    const bandHalf = (640 - 300) / 2 / 450
    for (const p of places) expect(p.r).toBeLessThanOrEqual(bandHalf)
  })

  it('never let neighbours overlap: close links give up the row instead', () => {
    for (const gap of [60, 100, 140, 200, 260, 360]) {
      const at = [0, 1, 2, 3].map((i) => 720 + (i - 1.5) * gap)
      const places = rowPlacement(stage, at, 200, 700)
      if (!places) {
        expect(gap).toBeLessThan(200)
        continue
      }
      for (let i = 1; i < places.length; i++) {
        expect(places[i].x - places[i - 1].x, `gap ${gap}`).toBeGreaterThanOrEqual(places[i].r + places[i - 1].r)
      }
    }
  })

  it('give up on a band that is too thin or links that are not four', () => {
    expect(rowPlacement(stage, centres, 400, 440)).toBeNull()
    expect(rowPlacement(stage, centres, 500, 300)).toBeNull()
    expect(rowPlacement(stage, centres.slice(0, 3), 300, 640)).toBeNull()
    expect(rowPlacement({ ...stage, height: 0 }, centres, 300, 640)).toBeNull()
  })

  it('fall back to a grid on a phone and a row on a phone lying down', () => {
    const portrait = autoPlacement(390 / 420)
    expect(portrait).toHaveLength(4)
    expect(new Set(portrait.map((p) => p.x)).size).toBe(2)
    expect(new Set(portrait.map((p) => p.y)).size).toBe(2)
    const landscape = autoPlacement(844 / 200)
    expect(new Set(landscape.map((p) => p.y)).size).toBe(1)
    for (const places of [portrait, landscape, autoPlacement(1.6), autoPlacement(0.01), autoPlacement(1e9)]) {
      for (const p of places) {
        expect(Number.isFinite(p.x + p.y + p.r)).toBe(true)
        expect(p.r).toBeGreaterThan(0.1)
        expect(Math.abs(p.y) + p.r).toBeLessThanOrEqual(1.0001)
      }
    }
  })

  it('keep the grid inside the stage on any shape', () => {
    for (const aspect of [0.5, 0.75, 1, 1.5, 2, 2.39]) {
      const places = autoPlacement(aspect)
      for (const p of places) {
        expect(Math.abs(p.x) + p.r).toBeLessThanOrEqual(aspect + 1e-9)
        expect(Math.abs(p.y) + p.r).toBeLessThanOrEqual(1 + 1e-9)
      }
      // The four circles do not overlap.
      for (let i = 0; i < 4; i++)
        for (let j = i + 1; j < 4; j++)
          expect(Math.hypot(places[i].x - places[j].x, places[i].y - places[j].y)).toBeGreaterThanOrEqual(
            places[i].r + places[j].r,
          )
    }
  })
})

describe('which zone a point is over', () => {
  const aspect = 1.6
  const anchors: Anchor[] = [
    { id: 'model-studio', x: -1.2, y: 0, r: 0.3 },
    { id: 'racing', x: -0.4, y: 0, r: 0.3 },
    { id: 'track-architect', x: 0.4, y: 0, r: 0.3 },
    { id: 'performance-lab', x: 1.2, y: 0, r: 0.3 },
  ]

  it('finds the zone a point is on, and nothing in empty space', () => {
    expect(hitZone(anchors, -1.2 / aspect, 0, aspect)).toBe('model-studio')
    expect(hitZone(anchors, 1.2 / aspect, 0.1, aspect)).toBe('performance-lab')
    expect(hitZone(anchors, 0, 0.9, aspect)).toBeNull()
    expect(hitZone(anchors, 0, 0, aspect)).toBeNull()
  })

  it('is a little generous at the edge, and a fingertip is more so', () => {
    const justOutside = (-1.2 + 0.3 * 1.1) / aspect
    expect(hitZone(anchors, justOutside, 0, aspect)).toBe('model-studio')
    // A single small zone: a point 0.4 away misses it, unless it is a fingertip.
    const alone: Anchor[] = [{ id: 'racing', x: 0, y: 0, r: 0.2 }]
    expect(hitZone(alone, 0.4 / aspect, 0, aspect)).toBeNull()
    expect(hitZone(alone, 0.4 / aspect, 0, aspect, 0.5)).toBe('racing')
  })

  it('gives an overlap to the zone whose centre is nearer in proportion to its size', () => {
    const overlapping: Anchor[] = [
      { id: 'racing', x: 0, y: 0, r: 0.5 },
      { id: 'track-architect', x: 0.4, y: 0, r: 0.5 },
    ]
    expect(hitZone(overlapping, 0.1 / aspect, 0, aspect)).toBe('racing')
    expect(hitZone(overlapping, 0.3 / aspect, 0, aspect)).toBe('track-architect')
  })

  it('has no zone when it has no anchors', () => {
    expect(hitZone([], 0, 0, aspect)).toBeNull()
  })
})

describe('the way in', () => {
  it('runs from 0 to 1 over the flight and eases out', () => {
    expect(openingProgress(10, 10)).toBe(0)
    expect(openingProgress(10 + OPEN_SECONDS, 10)).toBe(1)
    expect(openingProgress(99, 10)).toBe(1)
    expect(openingProgress(5, 10)).toBe(0)
    const half = openingProgress(10 + OPEN_SECONDS / 2, 10)
    expect(half).toBeGreaterThan(0.5)
    expect(half).toBeLessThan(1)
  })

  it('leaves a modified click to the browser (a new tab, a download)', () => {
    const base = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }
    expect(isPlainClick(base)).toBe(true)
    expect(isPlainClick({ ...base, ctrlKey: true })).toBe(false)
    expect(isPlainClick({ ...base, metaKey: true })).toBe(false)
    expect(isPlainClick({ ...base, shiftKey: true })).toBe(false)
    expect(isPlainClick({ ...base, button: 1 })).toBe(false)
    expect(isPlainClick({ ...base, defaultPrevented: true })).toBe(false)
  })
})
