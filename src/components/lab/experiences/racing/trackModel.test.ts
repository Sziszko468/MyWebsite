import { describe, expect, it } from 'vitest'
import {
  ELEMENT_KINDS,
  TRACK,
  Turtle,
  appendElement,
  defaultTrack,
  emptyTrack,
  gridSlot,
  newQuery,
  parseTrack,
  queryTrack,
  sampleTrack,
  serializeTrack,
  trackSignature,
  validateTrack,
  type TrackDef,
} from './trackModel'

describe('the default circuit', () => {
  const track = defaultTrack()
  const report = validateTrack(track)

  it('closes exactly and can be lapped', () => {
    expect(track.closed).toBe(true)
    expect(report.issues.filter((issue) => issue.severity === 'error')).toEqual([])
    expect(report.drivable).toBe(true)
  })

  it('is a real lap: a couple of kilometres, no corner sharper than the hairpin', () => {
    expect(report.length).toBeGreaterThan(1800)
    expect(report.length).toBeLessThan(3200)
    expect(report.minRadius).toBeGreaterThan(18)
    expect(report.minRadius).toBeLessThan(40)
  })

  it('has samples that are evenly spaced and run in one loop', () => {
    const s = report.samples!
    for (let i = 0; i < s.count; i += 37) {
      const j = (i + 1) % s.count
      expect(Math.hypot(s.x[j] - s.x[i], s.z[j] - s.z[i])).toBeGreaterThan(s.spacing * 0.8)
      expect(Math.hypot(s.x[j] - s.x[i], s.z[j] - s.z[i])).toBeLessThan(s.spacing * 1.05)
    }
    // The line is on the main straight, heading east.
    expect(s.tx[0]).toBeGreaterThan(0.99)
  })

  it('keeps the barriers outside the road', () => {
    const s = report.samples!
    for (let i = 0; i < s.count; i++) {
      expect(s.left[i]).toBeGreaterThan(s.half[i] + 1.5)
      expect(s.right[i]).toBeGreaterThan(s.half[i] + 1.5)
    }
  })
})

describe('querying the track', () => {
  const samples = sampleTrack(defaultTrack())!
  const q = newQuery()

  it('finds the centre line, the edges and the run-off', () => {
    const i = 100
    const nx = -samples.tz[i]
    const nz = samples.tx[i]
    queryTrack(samples, samples.x[i], samples.z[i], -1, q)
    expect(q.surface).toBe('asphalt')
    expect(Math.abs(q.d)).toBeLessThan(0.05)
    queryTrack(samples, samples.x[i] + nx * (samples.half[i] + 3), samples.z[i] + nz * (samples.half[i] + 3), i, q)
    expect(q.surface).toBe('grass')
    expect(q.d).toBeGreaterThan(0)
    queryTrack(samples, samples.x[i] - nx * (samples.left[i] + 1), samples.z[i] - nz * (samples.left[i] + 1), i, q)
    expect(q.surface).toBe('wall')
    expect(q.d).toBeLessThan(0)
  })

  it('reports distance along the track and wraps at the line', () => {
    queryTrack(samples, samples.x[50], samples.z[50], -1, q)
    expect(q.s).toBeCloseTo(50 * samples.spacing, 0)
    const slot = gridSlot(samples, 6)
    queryTrack(samples, slot.x, slot.z, -1, q)
    expect(q.s).toBeGreaterThan(samples.length - 10)
    expect(q.s).toBeLessThan(samples.length)
  })

  it('uses kerbs where the corner has them and gravel where it was asked for', () => {
    const kerbed = Array.from(samples.kerb).findIndex((flag) => flag === 1)
    expect(kerbed).toBeGreaterThan(0)
    const gravel = Array.from(samples.gravel).findIndex((flag) => flag === 1)
    const nx = -samples.tz[gravel]
    const nz = samples.tx[gravel]
    // The gravel is on the outside of the hairpin, which turns left: the right-hand side.
    queryTrack(
      samples,
      samples.x[gravel] + nx * (samples.half[gravel] + 4),
      samples.z[gravel] + nz * (samples.half[gravel] + 4),
      gravel,
      q,
    )
    expect(q.surface).toBe('gravel')
  })

  it('does not jump onto another part of the track that passes close by', () => {
    // The return leg runs 52 m from the main straight; from a hint on the straight, a point on the
    // return leg is still far enough that the search window cannot reach it.
    const onStraight = 100
    queryTrack(samples, samples.x[onStraight], samples.z[onStraight] - 52, onStraight, q)
    expect(q.index).toBeGreaterThan(onStraight - 49)
    expect(q.index).toBeLessThan(onStraight + 49)
  })
})

describe('validation', () => {
  const base = defaultTrack()
  const ids = (track: TrackDef) => validateTrack(track).issues.map((issue) => issue.id)

  it('wants a closed loop', () => {
    expect(ids({ ...base, closed: false })).toContain('not-closed')
  })

  it('wants at least four points', () => {
    expect(ids({ ...base, points: base.points.slice(0, 3) })).toContain('few-points')
  })

  it('refuses a corner that is too sharp for a car, and only warns about a tight one', () => {
    const lap = (radius: number): TrackDef => {
      const t = new Turtle(0, 0, 0, 0, 12)
        .begin()
        .straight(400)
        .arc(radius, 180, 'left')
        .straight(400)
        .arc(radius, 180, 'left')
      return { ...emptyTrack(), closed: true, points: t.points.slice(0, -1) }
    }
    // A loop only twenty-four metres across: its ends are turns of about twelve metres.
    const pin = [
      [0, 0],
      [150, 0],
      [300, 0],
      [310, 12],
      [300, 24],
      [150, 24],
      [0, 24],
      [-10, 12],
    ].map(([x, z]) => ({ x, z, y: 0, width: 12, kerb: false, gravel: false }))
    expect(ids({ ...emptyTrack(), closed: true, points: pin })).toContain('sharp-corner')
    const tight = validateTrack(lap(19))
    expect(tight.issues.some((issue) => issue.id === 'tight-corner' && issue.severity === 'warning')).toBe(true)
    expect(tight.issues.some((issue) => issue.id === 'sharp-corner')).toBe(false)
  })

  it('refuses a track that crosses itself', () => {
    // A figure of eight: the loop runs through its own middle.
    const points = Array.from({ length: 40 }, (_, i) => {
      const t = (i / 40) * Math.PI * 2
      return { x: 320 * Math.cos(t), z: 150 * Math.sin(2 * t), y: 0, width: 12, kerb: false, gravel: false }
    })
    expect(ids({ ...emptyTrack(), closed: true, points })).toContain('self-intersection')
  })

  it('refuses a road that is too narrow and points that are too close or too far apart', () => {
    const narrow = base.points.map((p, i) => (i === 5 ? { ...p, width: 6 } : p))
    expect(ids({ ...base, points: narrow })).toContain('narrow')
    const crowded = base.points.map((p, i) => (i === 4 ? { ...base.points[3], x: base.points[3].x + 1 } : p))
    expect(ids({ ...base, points: crowded })).toContain('bad-connection')
    // The 620 m straight with its points taken out leaves one jump of 500 metres.
    const far = base.points.filter((_, i) => i < 2 || i > 14)
    expect(ids({ ...base, points: far })).toContain('bad-connection')
  })

  it('refuses a track that is too short or too steep', () => {
    const small = new Turtle(0, 0, 0, 0, 12).begin().straight(60).arc(30, 180, 'left').straight(60).arc(30, 180, 'left')
    expect(ids({ ...emptyTrack(), closed: true, points: small.points.slice(0, -1) })).toContain('too-short')
    const steep = base.points.map((p, i) => (i % 4 === 0 ? { ...p, y: i % 8 === 0 ? 12 : -12 } : p))
    expect(ids({ ...base, points: steep })).toContain('steep')
  })
})

describe('the editor elements', () => {
  it('builds a drivable loop from the elements', () => {
    let track = { ...emptyTrack(), points: new Turtle(0, 0, 0, 0, 13).begin().straight(40).points }
    const plan = [
      'straight',
      'straight',
      'straight',
      'straight',
      'straight',
      'hairpin',
      'straight',
      'straight',
      'straight',
      'straight',
      'straight',
    ] as const
    for (const kind of plan) track = appendElement(track, kind, 'left')
    for (const kind of ['straight', 'straight', 'straight', 'hairpin'] as const)
      track = appendElement(track, kind, 'left')
    expect(track.points.length).toBeGreaterThan(20)
    expect(track.points.length).toBeLessThanOrEqual(TRACK.maxPoints)
    expect(track.closed).toBe(false)
  })

  it('adds every kind of element, and reopens a closed loop', () => {
    const start = defaultTrack()
    for (const kind of ELEMENT_KINDS) {
      const next = appendElement(start, kind, 'right')
      expect(next.points.length).toBeGreaterThan(start.points.length)
      expect(next.closed).toBe(false)
    }
  })

  it('stops at the point limit', () => {
    let track = emptyTrack()
    for (let i = 0; i < 200; i++) track = appendElement(track, 'straight', 'left')
    expect(track.points.length).toBeLessThanOrEqual(TRACK.maxPoints)
  })

  it('a hairpin turns the way it was asked to', () => {
    const left = appendElement(
      { ...emptyTrack(), points: new Turtle(0, 0, 0, 0, 13).begin().straight(40).points },
      'hairpin',
      'left',
    )
    const last = left.points[left.points.length - 1]
    // Heading east and turning left through 180 degrees: it ends north of where it began (smaller z) and heading west.
    expect(last.z).toBeLessThan(-40)
    expect(last.x).toBeLessThan(80)
  })
})

describe('saving and loading', () => {
  it('round-trips through JSON', () => {
    const track = defaultTrack()
    const back = parseTrack(JSON.parse(JSON.stringify(serializeTrack(track))))
    expect(back).not.toBeNull()
    expect(back!.points.length).toBe(track.points.length)
    expect(trackSignature(back!)).toBe(trackSignature(track))
  })

  it('has a signature that follows the shape', () => {
    const track = defaultTrack()
    const moved = { ...track, points: track.points.map((p, i) => (i === 3 ? { ...p, z: p.z + 5 } : p)) }
    expect(trackSignature(moved)).not.toBe(trackSignature(track))
  })

  it('refuses what is not a track and reduces what is hostile', () => {
    expect(parseTrack(null)).toBeNull()
    expect(parseTrack({ version: 2, points: [] })).toBeNull()
    expect(parseTrack({ version: 1, points: [{ x: 1, z: 2 }] })).toBeNull()
    // Nothing but junk is refused outright.
    expect(parseTrack({ version: 1, points: Array.from({ length: 300 }, () => ({ x: 'a', z: NaN })) })).toBeNull()
    const hostile = parseTrack({
      version: 1,
      name: '<img src=x onerror=alert(1)>'.repeat(10),
      closed: 'yes',
      start: 1e9,
      points: Array.from({ length: 5000 }, (_, i) => ({ x: i * 1e12, z: i, y: 9e9, width: i % 2 ? 9e9 : -5 })),
    })
    expect(hostile).not.toBeNull()
    expect(hostile!.points.length).toBeLessThanOrEqual(TRACK.maxPoints)
    expect(hostile!.name).not.toMatch(/[<>"']/)
    expect(hostile!.closed).toBe(false)
    for (const p of hostile!.points) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(TRACK.maxCoord)
      expect(p.width).toBeLessThanOrEqual(TRACK.maxWidth)
      expect(Math.abs(p.y)).toBeLessThanOrEqual(TRACK.maxElevation)
    }
  })
})
