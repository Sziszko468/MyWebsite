import { describe, expect, it } from 'vitest'
import { contrast, rawToken, resolveColor, type ThemeName } from '../../test/tokens'
import { clamp, damp, lerp, smoothstep } from './heroMath'
import { PHASE_END, sampleTimeline, scrollTransition, type HeroPhase } from './heroTimeline'
import {
  LINES,
  QUALITY,
  SLOW_FRAME_MS,
  UNUSABLE_FRAME_MS,
  composeFor,
  lowerTier,
  parseLayout,
  pickQuality,
  type DeviceHints,
} from './velocityHeroConfig'

describe('heroMath', () => {
  it('clamps, lerps and smooths', () => {
    expect(clamp(5)).toBe(1)
    expect(clamp(-2)).toBe(0)
    expect(lerp(10, 20, 0.25)).toBe(12.5)
    expect(smoothstep(0, 1, 0)).toBe(0)
    expect(smoothstep(0, 1, 1)).toBe(1)
    expect(smoothstep(0, 1, 0.5)).toBe(0.5)
  })

  it('damps at the same rate whatever the frame rate', () => {
    let a = 0
    for (let i = 0; i < 60; i++) a = damp(a, 1, 0.25, 1 / 60)
    let b = 0
    for (let i = 0; i < 30; i++) b = damp(b, 1, 0.25, 1 / 30)
    expect(a).toBeCloseTo(b, 6)
    expect(a).toBeCloseTo(1 - Math.pow(0.5, 1 / 0.25), 6)
  })
})

describe('timeline', () => {
  const at = (seconds: number) => sampleTimeline(seconds)

  it('walks through ignition, launch, acceleration and cruise in order', () => {
    const order: HeroPhase[] = [at(0).phase, at(2).phase, at(4.5).phase, at(20).phase]
    expect(order).toEqual(['ignition', 'launch', 'acceleration', 'cruise'])
    expect(at(PHASE_END.ignition - 0.01).phase).toBe('ignition')
    expect(at(PHASE_END.ignition).phase).toBe('launch')
  })

  it('keeps every value within range', () => {
    for (let t = 0; t <= 30; t += 0.05) {
      const s = at(t)
      for (const key of ['lights', 'speed', 'streak', 'push', 'squat'] as const) {
        expect(s[key], `${key} at ${t}`).toBeGreaterThanOrEqual(0)
        expect(s[key], `${key} at ${t}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('never jumps between frames, so the camera and lights cannot snap', () => {
    let previous = at(0)
    for (let t = 1 / 60; t <= 12; t += 1 / 60) {
      const s = at(t)
      for (const key of ['lights', 'speed', 'streak', 'push', 'squat'] as const) {
        expect(Math.abs(s[key] - previous[key]), `${key} at ${t.toFixed(3)}`).toBeLessThan(0.03)
      }
      previous = s
    }
  })

  it('starts dark and ends running', () => {
    expect(at(0).lights).toBe(0)
    expect(at(2).lights).toBe(1)
    expect(at(0).speed).toBeLessThan(0.1)
    expect(at(10).speed).toBeGreaterThan(0.6)
  })

  it('accelerates before it cruises', () => {
    const peak = Math.max(...[3.2, 4.2, 5.2, 5.8].map((t) => at(t).speed))
    expect(peak).toBeGreaterThan(at(60).speed)
    expect(at(5.8).streak).toBeGreaterThan(at(60).streak)
  })

  it('reacts to scroll without going out of range', () => {
    expect(scrollTransition(0)).toEqual({ speedBoost: 0, brightness: 1, dolly: -0, rise: 0 })
    const end = scrollTransition(1)
    expect(end.brightness).toBeGreaterThan(0.3)
    expect(end.speedBoost).toBeGreaterThan(0)
    expect(scrollTransition(5)).toEqual(end)
    expect(scrollTransition(-1).brightness).toBe(1)
  })
})

describe('quality', () => {
  const desktop: DeviceHints = { width: 1440, cores: 12, memory: 8, coarsePointer: false, saveData: false }

  it('gives strong desktops the full scene', () => {
    expect(pickQuality(desktop)).toBe('high')
  })

  it('drops to medium on a weaker desktop or a capable phone', () => {
    expect(pickQuality({ ...desktop, cores: 4, memory: 4 })).toBe('medium')
    expect(pickQuality({ width: 390, cores: 8, memory: 6, coarsePointer: true, saveData: false })).toBe('medium')
  })

  it('goes light on modest phones, low memory and data saver', () => {
    expect(pickQuality({ width: 390, cores: 4, memory: 3, coarsePointer: true, saveData: false })).toBe('low')
    expect(pickQuality({ ...desktop, memory: 2 })).toBe('low')
    expect(pickQuality({ ...desktop, saveData: true })).toBe('low')
  })

  it('treats a narrow window like a handheld', () => {
    expect(pickQuality({ ...desktop, width: 600 })).toBe('medium')
  })

  it('has a strictly lighter profile at every step down', () => {
    expect(lowerTier('high')).toBe('medium')
    expect(lowerTier('medium')).toBe('low')
    expect(lowerTier('low')).toBeNull()
    expect(QUALITY.high.particles).toBeGreaterThan(QUALITY.medium.particles)
    expect(QUALITY.medium.particles).toBeGreaterThan(QUALITY.low.particles)
    expect(QUALITY.high.maxDpr).toBeGreaterThanOrEqual(QUALITY.medium.maxDpr)
    expect(QUALITY.low.bloom).toBe(false)
    expect(QUALITY.medium.bloom).toBe(false)
    expect(SLOW_FRAME_MS).toBeLessThan(UNUSABLE_FRAME_MS)
  })
})

describe('composition', () => {
  it('puts the car beside the headline when the scene sits behind the text', () => {
    const wide = composeFor(16 / 9, 37, 'full')
    expect(wide.shiftX).toBeGreaterThan(0)
    expect(wide.dolly).toBe(0)
  })

  it('centres the car when the scene is a stage below the text', () => {
    for (const aspect of [0.8, 1, 1.4, 2]) {
      expect(composeFor(aspect, 37, 'stacked').shiftX, `aspect ${aspect}`).toBe(0)
    }
  })

  it('backs the camera off as a stacked stage gets narrower', () => {
    const dollies = [2, 1.4, 1.1, 0.9, 0.7].map((aspect) => composeFor(aspect, 37, 'stacked').dolly)
    expect(dollies[0]).toBe(0)
    for (let i = 1; i < dollies.length; i++) expect(dollies[i]).toBeGreaterThanOrEqual(dollies[i - 1])
    expect(dollies[dollies.length - 1]).toBeLessThanOrEqual(3)
  })

  it('keeps a natural lens on every screen', () => {
    for (const layout of ['full', 'stacked'] as const) {
      for (const aspect of [0.4, 0.8, 1, 1.3, 1.8, 2.4]) {
        expect(composeFor(aspect, 37, layout).fov, `${layout} ${aspect}`).toBeLessThanOrEqual(52)
      }
    }
  })

  it('reads the layout CSS declares and defaults to full', () => {
    expect(parseLayout('stacked')).toBe('stacked')
    expect(parseLayout(' stacked ')).toBe('stacked')
    expect(parseLayout('full')).toBe('full')
    expect(parseLayout('')).toBe('full')
  })
})

describe('light streaks', () => {
  it('are red-dominant, with blue as the secondary colour', () => {
    const red = LINES.filter((line) => line.color === 'red').length
    const blue = LINES.filter((line) => line.color === 'blue').length
    expect(red).toBeGreaterThan(blue)
    expect(blue).toBeGreaterThan(0)
  })

  it('have unique ids', () => {
    expect(new Set(LINES.map((line) => line.id)).size).toBe(LINES.length)
  })
})

describe('headline readability over the scene', () => {
  // The brightest thing the scene can put behind the headline is pure white (dark theme) or
  // pure black (light theme). Even then, the scrim must keep the text at AA contrast.
  const mix = (a: string, b: string, weightA: number) => {
    const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
    const parts = [0, 1, 2].map((i) => Math.round(channel(a, i) * weightA + channel(b, i) * (1 - weightA)))
    return `#${parts.map((v) => v.toString(16).padStart(2, '0')).join('')}`
  }

  const scrim = parseFloat(rawToken('--scene-scrim') ?? '0') / 100

  it('is defined', () => {
    expect(scrim).toBeGreaterThan(0.5)
    expect(scrim).toBeLessThanOrEqual(1)
  })

  // Worst case: the brightest possible pixel (white) behind the dark theme's light text, the
  // darkest (black) behind the light theme's dark text.
  const worst = (theme: ThemeName) => (theme === 'dark' ? '#ffffff' : '#000000')

  it.each(['dark', 'light'] as ThemeName[])('keeps the headline at AAA (7:1) in the %s theme', (theme) => {
    const behind = mix(resolveColor('--color-bg', theme)!, worst(theme), scrim)
    expect(contrast(resolveColor('--color-text', theme)!, behind)).toBeGreaterThanOrEqual(7)
  })

  it.each(['dark', 'light'] as ThemeName[])('keeps the description at AA (4.5:1) in the %s theme', (theme) => {
    const behind = mix(resolveColor('--color-bg', theme)!, worst(theme), scrim)
    expect(contrast(resolveColor('--color-text-secondary', theme)!, behind)).toBeGreaterThanOrEqual(4.5)
  })

  // The red second line is large text, where WCAG AA asks for 3:1.
  it.each(['dark', 'light'] as ThemeName[])('keeps the red headline line at large-text AA (3:1) in the %s theme', (theme) => {
    const behind = mix(resolveColor('--color-bg', theme)!, worst(theme), scrim)
    expect(contrast(resolveColor('--color-accent-text', theme)!, behind)).toBeGreaterThanOrEqual(3)
  })
})
