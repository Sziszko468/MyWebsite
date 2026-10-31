import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GHOST_RATE,
  GhostRecorder,
  ghostTimeAt,
  loadGhost,
  newPlace,
  parseGhost,
  sampleGhost,
  saveGhost,
  type Ghost,
} from './ghost'

/** A lap driven at 50 m/s along a straight, recorded as the scene does it. */
function lap(seconds = 20, speed = 50): Ghost {
  const recorder = new GhostRecorder()
  for (let t = 0; t <= seconds; t += 1 / 120) recorder.add(t, t * speed, 5, 0.3, t * speed)
  return recorder.finish(seconds)!
}

describe('recording a lap', () => {
  it('keeps twenty samples a second, however often it is offered a place', () => {
    const ghost = lap(10)
    expect(ghost.data.length / 4).toBeGreaterThanOrEqual(10 * GHOST_RATE)
    expect(ghost.data.length / 4).toBeLessThanOrEqual(10 * GHOST_RATE + 2)
    expect(ghost.time).toBeCloseTo(10, 1)
  })

  it('refuses a lap that is too short or too long to keep, and starts again from nothing', () => {
    const recorder = new GhostRecorder()
    recorder.add(0, 0, 0, 0, 0)
    expect(recorder.finish(1)).toBeNull()
    for (let t = 0; t < 10; t += 0.05) recorder.add(t, t, 0, 0, t)
    expect(recorder.finish(900)).toBeNull()
    expect(recorder.finish(NaN)).toBeNull()
    recorder.reset()
    expect(recorder.length).toBe(0)
  })

  it('never lets the distance go back', () => {
    const recorder = new GhostRecorder()
    for (let i = 0; i < 100; i++) recorder.add(i / GHOST_RATE, i, 0, 0, i < 50 ? i : 50 - (i - 50))
    const ghost = recorder.finish(5)!
    const distances = ghost.data.filter((_, i) => i % 4 === 3)
    expect([...distances].sort((a, b) => a - b)).toEqual(distances)
  })
})

describe('playing a ghost back', () => {
  const ghost = lap(20, 50)
  const place = newPlace()

  it('puts the car where it was, between two samples', () => {
    expect(sampleGhost(ghost, 10, place)).toBe(true)
    expect(place.x).toBeCloseTo(500, 0)
    expect(place.z).toBeCloseTo(5, 1)
    expect(sampleGhost(ghost, 10.025, place)).toBe(true)
    expect(place.x).toBeCloseTo(501.25, 0)
  })

  it('is nowhere before the line and after the end', () => {
    expect(sampleGhost(ghost, -0.1, place)).toBe(false)
    expect(sampleGhost(ghost, 25, place)).toBe(false)
  })

  it('turns the short way round when the heading wraps', () => {
    const recorder = new GhostRecorder()
    for (let i = 0; i < 40; i++) recorder.add(i / GHOST_RATE, i, 0, i % 2 === 0 ? 3.1 : -3.1, i)
    const wrapped = recorder.finish(2)!
    sampleGhost(wrapped, 0.025, place)
    expect(Math.abs(Math.abs(place.heading) - Math.PI)).toBeLessThan(0.2)
  })

  it('tells how long it took to get as far as you are: the live gap', () => {
    expect(ghostTimeAt(ghost, 500)).toBeCloseTo(10, 1)
    expect(ghostTimeAt(ghost, 0)).toBe(0)
    expect(ghostTimeAt(ghost, 99999)).toBeNull()
    // Driving the same lap, a second slower to the halfway point, is one second behind.
    expect(10 + 1 - ghostTimeAt(ghost, 500)!).toBeCloseTo(1, 1)
  })
})

describe('keeping a ghost in this browser', () => {
  const store = new Map<string, string>()
  beforeEach(() => {
    store.clear()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('saves and loads one per track and setup, and forgets the oldest', () => {
    const ghost = lap(12)
    expect(saveGhost('t1:s1', ghost)).toBe(true)
    expect(loadGhost('t1:s1')?.time).toBeCloseTo(ghost.time, 3)
    expect(loadGhost('t2:s1')).toBeNull()
    for (let i = 0; i < 8; i++) saveGhost(`k${i}:x`, ghost)
    expect(loadGhost('t1:s1')).toBeNull()
    expect(loadGhost('k7:x')).not.toBeNull()
  })

  it('refuses what is not a ghost, and what is hostile', () => {
    expect(parseGhost(null)).toBeNull()
    expect(parseGhost({ version: 2, time: 10, data: [] })).toBeNull()
    expect(parseGhost({ version: 1, time: 10, data: new Array(40).fill('x') })).toBeNull()
    expect(parseGhost({ version: 1, time: 10, data: new Array(41).fill(1) })).toBeNull()
    expect(parseGhost({ version: 1, time: 1e9, data: new Array(40).fill(1) })).toBeNull()
    expect(parseGhost({ version: 1, time: 10, data: new Array(40).fill(1e12) })).toBeNull()
    expect(parseGhost({ version: 1, time: 10, data: new Array(40).fill(1) })).not.toBeNull()
    store.set('lab:racing:ghosts', '{"bad key!":{"version":1}}')
    expect(loadGhost('bad key!')).toBeNull()
  })
})
