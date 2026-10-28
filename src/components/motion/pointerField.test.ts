import { describe, expect, it } from 'vitest'
import { formatVar, pointerVars } from './pointerField'

const box = { left: 100, top: 50, width: 400, height: 200 }

describe('pointerVars', () => {
  it('reads the middle of an element as 0, 0', () => {
    expect(pointerVars(box, 300, 150)).toEqual({ x: 200, y: 100, px: 0, py: 0 })
  })

  it('reads the edges as -1 and 1', () => {
    expect(pointerVars(box, 100, 50)).toMatchObject({ px: -1, py: -1 })
    expect(pointerVars(box, 500, 250)).toMatchObject({ px: 1, py: 1 })
  })

  it('never leaves the element, however far the pointer is', () => {
    const far = pointerVars(box, 9999, -9999)
    expect(far).toEqual({ x: 400, y: 0, px: 1, py: -1 })
    const behind = pointerVars(box, -5, 9999)
    expect(behind).toEqual({ x: 0, y: 200, px: -1, py: 1 })
  })

  it('reads an element without a size as the middle', () => {
    expect(pointerVars({ left: 10, top: 10, width: 0, height: 0 }, 50, 50)).toEqual({ x: 0, y: 0, px: 0, py: 0 })
  })
})

describe('formatVar', () => {
  it('keeps three digits and drops trailing zeros', () => {
    expect(formatVar(0.123456)).toBe('0.123')
    expect(formatVar(1)).toBe('1')
    expect(formatVar(-0.5)).toBe('-0.5')
  })

  it('does not print negative zero', () => {
    expect(formatVar(-0.0001)).toBe('0')
  })
})
