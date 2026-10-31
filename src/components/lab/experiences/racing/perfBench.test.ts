import { describe, expect, it } from 'vitest'
import { DEFAULT_SETUP } from './carSetup'
import { runBench } from './perfBench'

describe('the bench tests', () => {
  const base = runBench(DEFAULT_SETUP)

  it('give sensible numbers for the default car', () => {
    expect(base.zeroTo100).toBeGreaterThan(1.8)
    expect(base.zeroTo100).toBeLessThan(5)
    expect(base.zeroTo200!).toBeGreaterThan(base.zeroTo100!)
    expect(base.zeroTo200!).toBeLessThan(14)
    expect(base.topSpeed).toBeGreaterThan(240)
    expect(base.braking).toBeGreaterThan(60)
    expect(base.braking).toBeLessThan(220)
    expect(base.cornering).toBeGreaterThan(1.2)
    expect(base.cornering).toBeLessThan(4.5)
  })

  it('respond to the setup in the directions physics says', () => {
    expect(runBench({ ...DEFAULT_SETUP, mass: 700 }).zeroTo100!).toBeLessThan(base.zeroTo100!)
    expect(runBench({ ...DEFAULT_SETUP, mass: 920 }).zeroTo100!).toBeGreaterThan(base.zeroTo100!)
    expect(runBench({ ...DEFAULT_SETUP, tyreGrip: 1.8 }).cornering).toBeGreaterThan(base.cornering)
    expect(runBench({ ...DEFAULT_SETUP, downforce: 4.8 }).cornering).toBeGreaterThan(
      runBench({ ...DEFAULT_SETUP, downforce: 1.2 }).cornering,
    )
    expect(runBench({ ...DEFAULT_SETUP, downforce: 4.8 }).braking).toBeLessThan(
      runBench({ ...DEFAULT_SETUP, downforce: 1.2 }).braking,
    )
    expect(runBench({ ...DEFAULT_SETUP, downforce: 1.2 }).topSpeed).toBeGreaterThan(
      runBench({ ...DEFAULT_SETUP, downforce: 4.8 }).topSpeed,
    )
    expect(runBench({ ...DEFAULT_SETUP, gearing: 5.5 }).topSpeed).toBeLessThan(
      runBench({ ...DEFAULT_SETUP, gearing: 3.5 }).topSpeed,
    )
  })

  it('are repeatable', () => {
    expect(runBench(DEFAULT_SETUP)).toEqual(base)
  })
})
