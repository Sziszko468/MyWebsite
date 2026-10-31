/**
 * Weather and the time of day for the Racing Experience. What the physics has, the weather uses:
 * rain makes the road wet, and a wet road gives the tyres less grip (`RAIN_GRIP`), so braking is
 * longer and corners are slower, in the race and in the lap estimate alike. Fog and darkness change
 * only what can be seen: fog closes the view in, night puts the light on the car. They take nothing
 * from the grip, because in this model nothing about them should.
 */
export type Sky = 'clear' | 'rain' | 'fog'
export type Time = 'day' | 'dusk' | 'night'
/** `auto` follows the site's theme: a clear afternoon behind the light one, a sunset behind the dark one. */
export type TimeChoice = 'auto' | Time

export const SKIES: readonly Sky[] = ['clear', 'rain', 'fog']
export const TIMES: readonly TimeChoice[] = ['auto', 'day', 'dusk', 'night']

export interface Conditions {
  sky: Sky
  time: TimeChoice
}

export const DEFAULT_CONDITIONS: Conditions = { sky: 'clear', time: 'auto' }

/** The share of the dry grip a wet road keeps. */
export const RAIN_GRIP = 0.78

export const wetFactor = (sky: Sky): number => (sky === 'rain' ? RAIN_GRIP : 1)

export function resolveTime(conditions: Conditions, themeIsDark: boolean): Time {
  return conditions.time === 'auto' ? (themeIsDark ? 'dusk' : 'day') : conditions.time
}

/** Part of the key of a best lap and a ghost: a wet lap is not compared with a dry one. */
export const conditionsKey = (conditions: Conditions): string => (conditions.sky === 'rain' ? ':rain' : '')

export function parseConditions(raw: unknown): Conditions {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    sky: SKIES.includes(record.sky as Sky) ? (record.sky as Sky) : DEFAULT_CONDITIONS.sky,
    time: TIMES.includes(record.time as TimeChoice) ? (record.time as TimeChoice) : DEFAULT_CONDITIONS.time,
  }
}

export interface Atmosphere {
  top: number
  horizon: number
  /** Colour of the distance, and how far away it begins and is complete. */
  fog: number
  fogNear: number
  fogFar: number
  sun: { color: number; intensity: number; x: number; y: number; z: number }
  hemisphere: { sky: number; ground: number; intensity: number }
  environment: number
  /** The car lights its own way. */
  headlights: boolean
  wet: boolean
  rain: boolean
}

const mix = (a: number, b: number, t: number): number => {
  const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t)
  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
}

const BASE: Record<Time, Atmosphere & { grey: number }> = {
  day: {
    top: 0x7f9ae0,
    horizon: 0xf4e8d4,
    fog: 0xe4e0d4,
    fogNear: 220,
    fogFar: 1900,
    sun: { color: 0xfff1dc, intensity: 2.8, x: -0.5, y: 0.78, z: -0.4 },
    hemisphere: { sky: 0xbfd4ff, ground: 0x6a7a50, intensity: 0.6 },
    environment: 0.85,
    headlights: false,
    wet: false,
    rain: false,
    grey: 0x8a9098,
  },
  dusk: {
    top: 0x10142e,
    horizon: 0xff6a4f,
    fog: 0x6b4a54,
    fogNear: 220,
    fogFar: 1900,
    sun: { color: 0xff9a6b, intensity: 2.4, x: -0.8, y: 0.38, z: -0.45 },
    hemisphere: { sky: 0x4a4f7a, ground: 0x2a2630, intensity: 0.45 },
    environment: 0.7,
    headlights: true,
    wet: false,
    rain: false,
    grey: 0x3a3d4c,
  },
  night: {
    top: 0x02030a,
    horizon: 0x151b38,
    fog: 0x070a16,
    fogNear: 160,
    fogFar: 1500,
    sun: { color: 0x7f94ff, intensity: 0.4, x: -0.3, y: 0.7, z: -0.3 },
    hemisphere: { sky: 0x1a2250, ground: 0x05060c, intensity: 0.28 },
    environment: 0.22,
    headlights: true,
    wet: false,
    rain: false,
    grey: 0x0e1120,
  },
}

export function atmosphere(sky: Sky, time: Time): Atmosphere {
  const { grey, ...base } = BASE[time]
  const result: Atmosphere = { ...base, sun: { ...base.sun }, hemisphere: { ...base.hemisphere } }
  if (sky === 'rain') {
    // An overcast, wet day: the colours go towards grey, the sun is mostly behind cloud, the view closes in.
    result.top = mix(base.top, grey, 0.6)
    result.horizon = mix(base.horizon, grey, 0.6)
    result.fog = mix(base.fog, grey, 0.55)
    result.fogNear = base.fogNear * 0.45
    result.fogFar = base.fogFar * 0.5
    result.sun.intensity *= 0.35
    result.hemisphere.intensity *= 0.85
    result.environment *= 0.7
    result.wet = true
    result.rain = true
    result.headlights = true
  } else if (sky === 'fog') {
    result.top = mix(base.top, grey, 0.75)
    result.horizon = mix(base.horizon, grey, 0.8)
    result.fog = mix(base.fog, grey, 0.8)
    result.fogNear = 20
    result.fogFar = time === 'night' ? 240 : 340
    result.sun.intensity *= 0.5
    result.environment *= 0.8
    result.headlights = true
  }
  return result
}
