import { describe, expect, it } from 'vitest'
import { award, levelOf, progress, resetProgress } from '../../progress/progress'
import {
  TRACK_CHALLENGES,
  addPoint,
  dailyChallenge,
  evaluateChallenge,
  insertPoint,
  movePoint,
  nearestSegment,
  patchPoint,
  removePoint,
  reverseTrack,
  rouletteTrack,
  setAllWidths,
  trackStats,
} from './architectOps'
import { TRACK, defaultTrack, emptyTrack, sampleTrack, validateTrack } from './trackModel'

describe('editing a track', () => {
  const base = defaultTrack()

  it('moves a point and keeps it inside the limits', () => {
    const moved = movePoint(base, 4, 100, 50)
    expect(moved.points[4].x).toBe(100)
    expect(moved.points[4].z).toBe(50)
    expect(movePoint(base, 4, 1e9, -1e9).points[4].x).toBe(TRACK.maxCoord)
    expect(base.points[4].x).not.toBe(100)
  })

  it('inserts a point between two, in the width and height between them, and moves the start', () => {
    const narrower = patchPoint(patchPoint(base, 10, { width: 10 }), 11, { width: 20, y: 4 })
    const inserted = insertPoint(narrower, 10, 0, 0)
    expect(inserted.points.length).toBe(base.points.length + 1)
    expect(inserted.points[11].width).toBe(15)
    expect(inserted.points[11].y).toBeCloseTo((narrower.points[10].y + 4) / 2, 6)
    expect(insertPoint(base, 0, 0, 0).start).toBe(base.start + 1)
  })

  it('adds a point to the end and reopens the loop', () => {
    const added = addPoint(base, 10, 10)
    expect(added.closed).toBe(false)
    expect(added.points.at(-1)).toMatchObject({ x: 10, z: 10 })
    expect(addPoint(emptyTrack(), 5, 5).points).toHaveLength(1)
  })

  it('removes a point and keeps the start line on the same bend', () => {
    const removed = removePoint(base, 0)
    expect(removed.points.length).toBe(base.points.length - 1)
    expect(removed.start).toBe(base.start - 1)
    expect(removePoint(base, base.start).start).toBe(0)
    expect(removePoint(base, 999)).toBe(base)
  })

  it('sets properties inside their ranges', () => {
    expect(patchPoint(base, 3, { width: 1000 }).points[3].width).toBe(TRACK.maxWidth)
    expect(patchPoint(base, 3, { y: -99 }).points[3].y).toBe(-TRACK.maxElevation)
    expect(setAllWidths(base, 16).points.every((p) => p.width === 16)).toBe(true)
    expect(patchPoint(base, 3, { kerb: true }).points[3].kerb).toBe(true)
  })

  it('finds the segment nearest a click', () => {
    const near = nearestSegment(base, base.points[5].x + 3, base.points[5].z + 2)!
    expect([4, 5]).toContain(near.index)
    expect(near.distance).toBeLessThan(5)
    expect(nearestSegment(emptyTrack(), 0, 0)).toBeNull()
  })

  it('reverses the direction and keeps the shape', () => {
    const back = reverseTrack(base)
    expect(back.points[0]).toEqual(base.points.at(-1))
    expect(back.start).toBe(base.points.length - 1 - base.start)
    expect(validateTrack(back).drivable).toBe(true)
    expect(Math.abs(validateTrack(back).length - validateTrack(base).length)).toBeLessThan(2)
  })

  it('a track made by editing is checked like any other', () => {
    expect(validateTrack(removePoint(removePoint(removePoint(base, 1), 3), 5)).issues.length).toBeGreaterThanOrEqual(0)
    const open = addPoint(base, 0, 0)
    expect(validateTrack(open).drivable).toBe(false)
  })
})

describe('track statistics and challenges', () => {
  const samples = sampleTrack(defaultTrack())!
  const stats = trackStats(samples)
  const report = validateTrack(defaultTrack())

  it('describes the Lab Circuit', () => {
    expect(stats.length).toBeGreaterThan(1800)
    expect(stats.corners).toBeGreaterThanOrEqual(4)
    expect(stats.hairpins).toBeGreaterThanOrEqual(1)
    expect(stats.straight).toBeGreaterThan(450)
    expect(stats.elevation).toBeGreaterThan(5)
    expect(stats.radius).toBeLessThan(40)
  })

  it('judges each rule from the numbers, and passes nothing for a track that cannot be driven', () => {
    const flowing = TRACK_CHALLENGES.find((c) => c.id === 'flowing')!
    const result = evaluateChallenge(flowing, report, stats)
    expect(result.rules).toHaveLength(flowing.rules.length)
    expect(result.rules.find((r) => r.rule.metric === 'straight')?.pass).toBe(true)
    expect(result.rules.find((r) => r.rule.metric === 'radius')?.pass).toBe(false)
    expect(result.complete).toBe(false)
    const broken = validateTrack({ ...defaultTrack(), closed: false })
    expect(evaluateChallenge(flowing, broken, stats).rules.every((r) => !r.pass)).toBe(true)
    const hills = evaluateChallenge(
      TRACK_CHALLENGES.find((c) => c.id === 'hills')!,
      report,
      stats,
    )
    expect(hills.complete).toBe(true)
  })

  it('picks the same challenge for the same date, and a different one the next day', () => {
    expect(dailyChallenge(new Date(2026, 9, 31)).id).toBe(dailyChallenge(new Date(2026, 9, 31, 23, 59)).id)
    expect(dailyChallenge(new Date(2026, 10, 1)).id).not.toBe(dailyChallenge(new Date(2026, 9, 31)).id)
  })
})

describe('Track Roulette', () => {
  it('always draws a track that can be driven, and the same one for the same number', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const track = rouletteTrack(seed)
      const report = validateTrack(track)
      expect(report.drivable, `seed ${seed}`).toBe(true)
      expect(report.length).toBeGreaterThan(1400)
      expect(track.closed).toBe(true)
    }
    expect(rouletteTrack(7)).toEqual(rouletteTrack(7))
    expect(rouletteTrack(7)).not.toEqual(rouletteTrack(8))
  })

  it('does not draw the same shape every time', () => {
    const lengths = new Set(
      Array.from({ length: 12 }, (_, i) => Math.round(validateTrack(rouletteTrack(i + 100)).length / 50)),
    )
    expect(lengths.size).toBeGreaterThan(4)
  })
})

describe('progress', () => {
  it('pays an event once, unlocks an achievement once, and counts only what happened', () => {
    resetProgress()
    expect(progress.get().xp).toBe(0)
    const first = award('lap:first', 20, 'first-lap')
    expect(first).toMatchObject({ fresh: true, achievement: 'first-lap' })
    expect(first.xp).toBe(60)
    const again = award('lap:first', 20, 'first-lap')
    expect(again).toMatchObject({ fresh: false, xp: 0, achievement: null })
    // A different event for an achievement that is already unlocked pays only its own points.
    expect(award('lap:second', 10, 'first-lap')).toMatchObject({ fresh: true, xp: 10, achievement: null })
    expect(progress.get().xp).toBe(70)
    expect(award('x', 5, 'not-an-achievement').achievement).toBeNull()
    resetProgress()
  })

  it('turns points into levels', () => {
    expect(levelOf(0)).toMatchObject({ level: 1, into: 0 })
    expect(levelOf(100).level).toBe(2)
    expect(levelOf(99).level).toBe(1)
    expect(levelOf(10_000_000).level).toBeLessThanOrEqual(99)
  })
})
