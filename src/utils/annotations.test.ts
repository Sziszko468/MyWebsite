import { describe, expect, it } from 'vitest'
import { centre, clamp01, describePoint, isPoint, markerStyle, nudge, round4, stepOf, toNormalized } from './annotations'

describe('a position on a picture', () => {
  const box = { left: 100, top: 50, width: 400, height: 200 }

  it('is the share of the picture’s width and height from its top left, whatever the picture’s size on screen', () => {
    expect(toNormalized({ x: 300, y: 150 }, box)).toEqual({ x: 0.5, y: 0.5 })
    expect(toNormalized({ x: 100, y: 50 }, box)).toEqual({ x: 0, y: 0 })
    expect(toNormalized({ x: 500, y: 250 }, box)).toEqual({ x: 1, y: 1 })
    // The same spot at half the size is the same number: that is why a marker stays put when the picture scales.
    expect(toNormalized({ x: 200, y: 100 }, { left: 0, top: 0, width: 200, height: 100 })).toEqual(toNormalized({ x: 400, y: 200 }, { left: 0, top: 0, width: 400, height: 200 }))
  })

  it('clamps a pointer outside the picture to its edge and refuses a picture with no size', () => {
    expect(toNormalized({ x: 9999, y: -50 }, box)).toEqual({ x: 1, y: 0 })
    expect(toNormalized({ x: 10, y: 10 }, { left: 0, top: 0, width: 0, height: 100 })).toBeNull()
    expect(toNormalized({ x: 10, y: 10 }, { left: 0, top: 0, width: 100, height: Number.NaN })).toBeNull()
  })

  it('rounds to four decimals, like the server', () => {
    expect(round4(0.123456789)).toBe(0.1235)
    expect(toNormalized({ x: 100 + 400 / 3, y: 50 }, box)).toEqual({ x: 0.3333, y: 0 })
  })

  it('moves with the keyboard by a percent (five with Shift) and never leaves the picture', () => {
    expect(nudge(centre, 1, 0)).toEqual({ x: 0.51, y: 0.5 })
    expect(nudge(centre, 0, -5)).toEqual({ x: 0.5, y: 0.45 })
    expect(nudge({ x: 0.995, y: 0.005 }, 5, -5)).toEqual({ x: 1, y: 0 })
    expect(stepOf('ArrowLeft', false)).toEqual({ dx: -1, dy: 0 })
    expect(stepOf('ArrowDown', true)).toEqual({ dx: 0, dy: 5 })
    expect(stepOf('Enter', false)).toBeNull()
    expect(stepOf('a', true)).toBeNull()
  })

  it('draws a marker in percent of the picture, so it scales with it, and says where it is in whole percent', () => {
    expect(markerStyle({ x: 0.25, y: 0.5 })).toEqual({ left: '25%', top: '50%' })
    expect(markerStyle({ x: 0.1235, y: 1 })).toEqual({ left: '12.35%', top: '100%' })
    expect(describePoint({ x: 0.346, y: 0.5 })).toEqual({ left: 35, top: 50 })
  })

  it('knows what the server will accept', () => {
    expect(isPoint({ x: 0, y: 1 })).toBe(true)
    for (const value of [null, undefined, 5, 'a', { x: 0.5 }, { x: 1.1, y: 0 }, { x: -0.1, y: 0 }, { x: Number.NaN, y: 0 }, { x: '0.5', y: 0.5 }]) expect(isPoint(value), String(value)).toBe(false)
    expect(clamp01(Number.NaN)).toBe(0)
    expect(clamp01(2)).toBe(1)
  })
})
