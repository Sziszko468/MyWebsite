import { describe, expect, it } from 'vitest'
import { deriveCarParams } from './carPhysics'
import { DEFAULT_SETUP } from './carSetup'
import { runBench } from './perfBench'
import { simulateLap } from './lapSim'
import { defaultTrack, sampleTrack } from './trackModel'
import {
  DEFAULT_CONDITIONS,
  RAIN_GRIP,
  atmosphere,
  conditionsKey,
  parseConditions,
  resolveTime,
  wetFactor,
} from './weather'

describe('weather and the time of day', () => {
  it('only rain takes grip, and only rain separates the best laps', () => {
    expect(wetFactor('clear')).toBe(1)
    expect(wetFactor('fog')).toBe(1)
    expect(wetFactor('rain')).toBe(RAIN_GRIP)
    expect(conditionsKey({ sky: 'rain', time: 'night' })).toBe(':rain')
    expect(conditionsKey({ sky: 'fog', time: 'night' })).toBe('')
    expect(conditionsKey(DEFAULT_CONDITIONS)).toBe('')
  })

  it('follows the theme only when asked to', () => {
    expect(resolveTime({ sky: 'clear', time: 'auto' }, true)).toBe('dusk')
    expect(resolveTime({ sky: 'clear', time: 'auto' }, false)).toBe('day')
    expect(resolveTime({ sky: 'clear', time: 'night' }, false)).toBe('night')
  })

  it('reads what is stored and refuses what is not a condition', () => {
    expect(parseConditions({ sky: 'rain', time: 'night' })).toEqual({ sky: 'rain', time: 'night' })
    expect(parseConditions({ sky: 'snow', time: 5 })).toEqual(DEFAULT_CONDITIONS)
    expect(parseConditions(null)).toEqual(DEFAULT_CONDITIONS)
  })

  it('closes the view in with fog and rain, and darkens the night', () => {
    const clear = atmosphere('clear', 'day')
    const rain = atmosphere('rain', 'day')
    const fog = atmosphere('fog', 'day')
    expect(rain.fogFar).toBeLessThan(clear.fogFar)
    expect(fog.fogFar).toBeLessThan(rain.fogFar)
    expect(fog.fogNear).toBeLessThan(rain.fogNear)
    expect(rain.wet && rain.rain).toBe(true)
    expect(clear.wet || fog.wet).toBe(false)
    expect(atmosphere('clear', 'night').sun.intensity).toBeLessThan(atmosphere('clear', 'dusk').sun.intensity)
    expect(atmosphere('clear', 'night').environment).toBeLessThan(atmosphere('clear', 'day').environment)
    expect(clear.headlights).toBe(false)
    expect(atmosphere('clear', 'night').headlights).toBe(true)
    // The clear day is not changed by anything done to a copy.
    atmosphere('rain', 'day').sun.intensity = 0
    expect(atmosphere('clear', 'day').sun.intensity).toBeGreaterThan(2)
  })
})

describe('what the weather does to the car', () => {
  const dry = runBench(DEFAULT_SETUP)
  const wet = runBench(DEFAULT_SETUP, RAIN_GRIP)

  it('a wet road makes the car stop later and corner more slowly', () => {
    expect(wet.braking).toBeGreaterThan(dry.braking * 1.15)
    expect(wet.cornering).toBeLessThan(dry.cornering * 0.9)
  })

  it('and makes the estimated lap slower, by a sensible amount', () => {
    const track = sampleTrack(defaultTrack())!
    const dryLap = simulateLap(track, deriveCarParams(DEFAULT_SETUP)).lapTime
    const wetLap = simulateLap(track, deriveCarParams(DEFAULT_SETUP, RAIN_GRIP)).lapTime
    expect(wetLap).toBeGreaterThan(dryLap * 1.03)
    expect(wetLap).toBeLessThan(dryLap * 1.3)
  })
})
