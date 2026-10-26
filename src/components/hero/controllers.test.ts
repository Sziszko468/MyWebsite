import { describe, expect, it } from 'vitest'
import { CursorController } from './CursorController'
import { createScrollPose, ScrollTransition, scrollPose } from './ScrollTransition'
import { CURSOR, FIELD } from './velocityHeroConfig'

const STEP = 1 / 60

function run(seconds: number, frame: (t: number) => void) {
  for (let t = 0; t < seconds; t += STEP) frame(t)
}

describe('CursorController', () => {
  it('starts calm', () => {
    const cursor = new CursorController()
    expect(cursor.energy).toBe(0)
    expect(cursor.settled).toBe(true)
  })

  it('never jumps: a sudden move of the real pointer becomes a gradual glide', () => {
    const cursor = new CursorController()
    cursor.setTarget(-1, 0)
    cursor.update(STEP)
    cursor.setTarget(1, 0) // a 2-unit jump in one frame
    let previous = cursor.x
    let largest = 0
    run(1, () => {
      cursor.update(STEP)
      largest = Math.max(largest, Math.abs(cursor.x - previous))
      previous = cursor.x
    })
    // The eased position covers well under half of the jump in any single frame...
    expect(largest).toBeLessThan(0.2)
    // ...and still gets there.
    expect(cursor.x).toBeGreaterThan(0.95)
  })

  it('places the eased position at the first pointer sighting instead of gliding in from the corner', () => {
    const cursor = new CursorController()
    cursor.setTarget(0.6, -0.4)
    expect(cursor.x).toBe(0.6)
    expect(cursor.y).toBe(-0.4)
  })

  it('reports the direction and speed of the movement', () => {
    const cursor = new CursorController()
    cursor.setTarget(-0.8, 0.2)
    let x = -0.8
    run(0.6, () => {
      x += 1.2 * STEP // a steady 1.2 units per second to the right
      cursor.setTarget(x, 0.2)
      cursor.update(STEP)
    })
    expect(cursor.vx).toBeGreaterThan(0.8)
    expect(Math.abs(cursor.vy)).toBeLessThan(0.05)
    expect(cursor.energy).toBeGreaterThan(0.4)
    expect(cursor.energy).toBeLessThanOrEqual(1)
  })

  it('has more energy the faster the cursor moves', () => {
    const energyAt = (speed: number) => {
      const cursor = new CursorController()
      cursor.setTarget(-1, 0)
      let x = -1
      run(0.5, () => {
        x += speed * STEP
        cursor.setTarget(x, 0)
        cursor.update(STEP)
      })
      return cursor.energy
    }
    expect(energyAt(0.3)).toBeLessThan(energyAt(1))
    expect(energyAt(1)).toBeLessThan(energyAt(3))
  })

  it('settles back to rest gradually once the cursor stops', () => {
    const cursor = new CursorController()
    cursor.setTarget(-1, 0)
    let x = -1
    run(0.5, () => {
      x += 2.5 * STEP
      cursor.setTarget(x, 0)
      cursor.update(STEP)
    })
    const moving = cursor.energy
    expect(moving).toBeGreaterThan(0.6)

    const trace: number[] = []
    run(4, (t) => {
      cursor.update(STEP)
      if (Math.round(t * 60) % 30 === 0) trace.push(cursor.energy)
    })
    // Strictly falling, not an instant drop...
    for (let i = 1; i < trace.length; i++) expect(trace[i]).toBeLessThanOrEqual(trace[i - 1] + 1e-9)
    expect(trace[2]).toBeGreaterThan(0.05)
    // ...and essentially calm after a few seconds.
    expect(cursor.energy).toBeLessThan(0.05)
  })

  it('keeps its position bounded however far the pointer travels', () => {
    const cursor = new CursorController()
    cursor.setTarget(40, -90)
    run(1, () => cursor.update(STEP))
    expect(Math.abs(cursor.x)).toBeLessThanOrEqual(1.2)
    expect(Math.abs(cursor.y)).toBeLessThanOrEqual(1.2)
    expect(Math.hypot(cursor.vx, cursor.vy)).toBeLessThanOrEqual(CURSOR.maxVelocity * Math.SQRT2)
  })

  it('is frame-rate independent', () => {
    const glide = (frames: number) => {
      const cursor = new CursorController()
      cursor.setTarget(-1, 0)
      cursor.update(0.001)
      cursor.setTarget(1, 0)
      for (let i = 0; i < frames; i++) cursor.update(0.5 / frames)
      return cursor.x
    }
    expect(glide(30)).toBeCloseTo(glide(120), 3)
  })

  it('records click waves in a fixed ring and tells the renderer when they change', () => {
    const cursor = new CursorController()
    const version = cursor.rippleVersion
    cursor.ripple(0.2, -0.3, 12.5)
    expect(cursor.rippleVersion).toBe(version + 1)
    expect(Array.from(cursor.ripples.slice(0, 4))).toEqual([expect.closeTo(0.2), expect.closeTo(-0.3), 12.5, 1])

    for (let i = 0; i < CURSOR.maxRipples + 2; i++) cursor.ripple(0, 0, 20 + i)
    expect(cursor.ripples.length).toBe(CURSOR.maxRipples * 4)
    // The oldest waves were overwritten.
    const starts = [0, 1, 2, 3].map((slot) => cursor.ripples[slot * 4 + 2])
    expect(Math.min(...starts)).toBeGreaterThanOrEqual(22)
  })

  it('starts with every wave long expired', () => {
    const cursor = new CursorController()
    for (let slot = 0; slot < CURSOR.maxRipples; slot++) expect(cursor.ripples[slot * 4 + 2]).toBeLessThan(-1000)
  })

  it('can be put back at rest', () => {
    const cursor = new CursorController()
    cursor.setTarget(-1, 0)
    cursor.update(STEP)
    cursor.setTarget(1, 1)
    run(0.3, () => cursor.update(STEP))
    cursor.rest()
    expect(cursor.energy).toBe(0)
    expect(cursor.presence).toBe(0)
    expect(cursor.speed).toBe(0)
    expect(cursor.settled).toBe(true)
  })

  /** Moves the cursor along a straight line at a steady speed (units per second) for a while. */
  const sweep = (cursor: CursorController, from: [number, number], velocity: [number, number], seconds: number) => {
    let [x, y] = from
    cursor.setTarget(x, y)
    run(seconds, () => {
      x += velocity[0] * STEP
      y += velocity[1] * STEP
      cursor.setTarget(x, y)
      cursor.update(STEP)
    })
  }

  it('tells a left-to-right sweep from a right-to-left one by its heading', () => {
    const right = new CursorController()
    sweep(right, [-0.8, 0], [1.6, 0], 0.5)
    const left = new CursorController()
    sweep(left, [0.8, 0], [-1.6, 0], 0.5)
    expect(Math.cos(right.heading)).toBeGreaterThan(0.9)
    expect(Math.cos(left.heading)).toBeLessThan(-0.9)
    expect(right.vx).toBeGreaterThan(0)
    expect(left.vx).toBeLessThan(0)

    const up = new CursorController()
    sweep(up, [0, -0.8], [0, 1.6], 0.5)
    expect(Math.sin(up.heading)).toBeGreaterThan(0.9)
  })

  it('reports speed and the distance travelled', () => {
    const cursor = new CursorController()
    sweep(cursor, [-0.8, 0], [1, 0], 0.6)
    expect(cursor.speed).toBeGreaterThan(0.7)
    expect(cursor.speed).toBeCloseTo(Math.hypot(cursor.vx, cursor.vy), 9)
    expect(cursor.step).toBeGreaterThan(0)
    // 0.6 s at 1 unit/s, less the glide still catching up.
    expect(cursor.pathLength).toBeGreaterThan(0.4)
    expect(cursor.pathLength).toBeLessThan(0.65)
  })

  it('keeps presence while the pointer moves, slowly or fast, and lets it fade after', () => {
    const slow = new CursorController()
    sweep(slow, [-0.5, 0], [0.4, 0], 0.5)
    expect(slow.presence).toBe(1)
    // Slow movement has little energy but full presence: the basis of the fine detail.
    expect(slow.energy).toBeLessThan(0.35)

    const trace: number[] = []
    run(5, () => {
      slow.update(STEP)
      trace.push(slow.presence)
    })
    for (let i = 1; i < trace.length; i++) expect(trace[i]).toBeLessThanOrEqual(trace[i - 1] + 1e-9)
    expect(trace.at(-1)).toBeLessThan(0.1)
  })

  it('does not change its heading when it stands still', () => {
    const cursor = new CursorController()
    sweep(cursor, [-0.8, 0], [1.6, 0], 0.4)
    const heading = cursor.heading
    run(3, () => cursor.update(STEP))
    expect(cursor.heading).toBe(heading)
  })

  it('is settled only when nothing is left moving or fading', () => {
    const cursor = new CursorController()
    sweep(cursor, [-0.8, 0], [1.6, 0], 0.3)
    expect(cursor.settled).toBe(false)
    run(12, () => cursor.update(STEP))
    expect(cursor.settled).toBe(true)
  })

  it('knows whether a click wave is still travelling, on the clock the shaders use', () => {
    const cursor = new CursorController()
    expect(cursor.hasActiveRipples(100)).toBe(false)
    cursor.ripple(0, 0, 100)
    expect(cursor.hasActiveRipples(100)).toBe(true)
    expect(cursor.hasActiveRipples(100 + FIELD.rippleSeconds - 0.1)).toBe(true)
    expect(cursor.hasActiveRipples(100 + FIELD.rippleSeconds + 0.1)).toBe(false)
  })
})

describe('ScrollTransition', () => {
  it('eases towards the scroll position instead of snapping to it', () => {
    const scroll = new ScrollTransition()
    scroll.setTarget(1)
    scroll.update(STEP)
    expect(scroll.progress).toBeGreaterThan(0)
    expect(scroll.progress).toBeLessThan(0.1)
    run(2, () => scroll.update(STEP))
    expect(scroll.progress).toBeGreaterThan(0.99)
  })

  it('stays within 0..1 whatever the input', () => {
    const scroll = new ScrollTransition()
    scroll.setTarget(-5)
    run(1, () => scroll.update(STEP))
    expect(scroll.progress).toBeGreaterThanOrEqual(0)
    scroll.setTarget(9)
    run(3, () => scroll.update(STEP))
    expect(scroll.progress).toBeLessThanOrEqual(1)
  })

  it('reports its velocity while it moves and settles when it arrives', () => {
    const scroll = new ScrollTransition()
    scroll.setTarget(0.8)
    run(0.15, () => scroll.update(STEP))
    expect(scroll.velocity).toBeGreaterThan(0.2)
    expect(scroll.settled).toBe(false)
    run(5, () => scroll.update(STEP))
    expect(scroll.settled).toBe(true)
  })

  it('can always be reversed: scrolling back returns to the start', () => {
    const scroll = new ScrollTransition()
    scroll.setTarget(1)
    run(2, () => scroll.update(STEP))
    scroll.setTarget(0)
    run(3, () => scroll.update(STEP))
    expect(scroll.progress).toBeLessThan(0.01)
  })
})

describe('scrollPose', () => {
  it('is the calm pose at the top', () => {
    const pose = scrollPose(0, createScrollPose())
    expect(pose.roll).toBeCloseTo(0, 9)
    expect(pose.pitch).toBeCloseTo(0, 9)
    expect(pose.shiftY).toBeCloseTo(0, 9)
    expect(pose.speedBoost).toBeCloseTo(0, 9)
    expect(pose.brightness).toBe(1)
  })

  it('turns the lines, sinks the focal point and speeds the world up as the hero leaves', () => {
    const top = scrollPose(0)
    const half = scrollPose(0.5)
    const end = scrollPose(1)
    expect(half.roll).toBeGreaterThan(top.roll)
    expect(end.roll).toBeGreaterThan(half.roll)
    expect(end.shiftY).toBeLessThan(half.shiftY)
    expect(end.speedBoost).toBeGreaterThan(half.speedBoost)
    expect(end.brightness).toBeLessThan(half.brightness)
    expect(end.brightness).toBeGreaterThan(0.2)
  })

  it('changes smoothly: no step between neighbouring positions', () => {
    let previous = scrollPose(0)
    const copy = (p: ReturnType<typeof scrollPose>) => ({ ...p })
    let last = copy(previous)
    for (let p = 0.005; p <= 1; p += 0.005) {
      previous = scrollPose(p)
      for (const key of ['roll', 'pitch', 'shiftY', 'speedBoost', 'brightness'] as const) {
        expect(Math.abs(previous[key] - last[key]), `${key} at ${p.toFixed(3)}`).toBeLessThan(0.02)
      }
      last = copy(previous)
    }
  })

  it('clamps out-of-range progress', () => {
    expect(scrollPose(-3)).toEqual(scrollPose(0))
    expect(scrollPose(7)).toEqual(scrollPose(1))
  })
})
