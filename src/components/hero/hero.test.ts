import { describe, expect, it } from 'vitest'
import { contrast, rawToken, resolveColor, type ThemeName } from '../../test/tokens'
import { clamp, damp, lerp, seededRandom, smoothstep } from './heroMath'
import {
  CURSOR,
  FIELD,
  INTRO_QUALITY,
  QUALITY,
  SLOW_FRAME_MS,
  UNUSABLE_FRAME_MS,
  composeFor,
  lowerTier,
  parseLayout,
  pickQuality,
  profileFor,
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

  it('generates the same numbers for the same seed and different ones otherwise', () => {
    const a = seededRandom(7)
    const b = seededRandom(7)
    const c = seededRandom(8)
    const first = [a(), a(), a()]
    expect([b(), b(), b()]).toEqual(first)
    expect([c(), c(), c()]).not.toEqual(first)
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
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
    for (const key of ['streaks', 'particles', 'trails', 'trailSegments'] as const) {
      expect(QUALITY.high[key], key).toBeGreaterThan(QUALITY.medium[key])
      expect(QUALITY.medium[key], key).toBeGreaterThan(QUALITY.low[key])
    }
    expect(QUALITY.high.maxDpr).toBeGreaterThanOrEqual(QUALITY.medium.maxDpr)
    expect(QUALITY.medium.maxDpr).toBeGreaterThanOrEqual(QUALITY.low.maxDpr)
    expect(QUALITY.high.surfaces).toBeGreaterThanOrEqual(QUALITY.medium.surfaces)
    expect(QUALITY.low.bloom).toBe(false)
    expect(QUALITY.medium.bloom).toBe(false)
    expect(SLOW_FRAME_MS).toBeLessThan(UNUSABLE_FRAME_MS)
  })
})

describe('the detailed intro profiles', () => {
  const tiers = ['high', 'medium', 'low'] as const

  it('is chosen for the intro and leaves the hero as it was', () => {
    for (const tier of tiers) {
      expect(profileFor('intro', tier)).toBe(INTRO_QUALITY[tier])
      expect(profileFor('hero', tier)).toBe(QUALITY[tier])
      // The hero draws none of the fine layers.
      expect(QUALITY[tier]).toMatchObject({ hairlines: 0, fineTrails: 0, rings: 0, gridDetail: 1, overlay: false })
    }
  })

  it('has several times the detail of the hero at every tier', () => {
    for (const tier of tiers) {
      const intro = INTRO_QUALITY[tier]
      const hero = QUALITY[tier]
      expect(intro.particles, `${tier} particles`).toBeGreaterThanOrEqual(hero.particles * 3)
      expect(intro.hairlines + intro.streaks, `${tier} streaks`).toBeGreaterThanOrEqual(hero.streaks * 2.5)
      expect(intro.trails + intro.fineTrails, `${tier} trails`).toBeGreaterThanOrEqual(hero.trails * 2)
      expect(intro.rings, `${tier} rings`).toBeGreaterThan(0)
      expect(intro.overlay).toBe(true)
    }
  })

  it('has a strictly lighter profile at every step down', () => {
    for (const key of ['streaks', 'particles', 'trails', 'fineTrails', 'trailSegments', 'hairlines', 'rings', 'maxPixels'] as const) {
      expect(INTRO_QUALITY.high[key], key).toBeGreaterThan(INTRO_QUALITY.medium[key])
      expect(INTRO_QUALITY.medium[key], key).toBeGreaterThan(INTRO_QUALITY.low[key])
    }
    expect(INTRO_QUALITY.high.gridDetail).toBeGreaterThanOrEqual(INTRO_QUALITY.medium.gridDetail)
    expect(INTRO_QUALITY.medium.gridDetail).toBeGreaterThanOrEqual(INTRO_QUALITY.low.gridDetail)
  })

  it('keeps the same device limits as the hero, with a pixel budget no larger', () => {
    for (const tier of tiers) {
      expect(INTRO_QUALITY[tier].maxDpr).toBe(QUALITY[tier].maxDpr)
      expect(INTRO_QUALITY[tier].bloom).toBe(QUALITY[tier].bloom)
      expect(INTRO_QUALITY[tier].maxPixels).toBeLessThanOrEqual(QUALITY[tier].maxPixels)
    }
  })
})

describe('composition', () => {
  it('puts the focal point beside the headline when the scene sits behind the text', () => {
    const wide = composeFor(16 / 9, 'full')
    expect(wide.shiftX).toBeGreaterThan(0)
  })

  it('centres it when the scene is a stage below the text', () => {
    for (const aspect of [0.7, 1, 1.4, 2]) {
      expect(composeFor(aspect, 'stacked').shiftX, `aspect ${aspect}`).toBe(0)
    }
  })

  it('keeps a natural lens on every screen', () => {
    for (const layout of ['full', 'stacked'] as const) {
      for (const aspect of [0.4, 0.8, 1, 1.3, 1.8, 2.4]) {
        const { fov } = composeFor(aspect, layout)
        expect(fov, `${layout} ${aspect}`).toBeGreaterThanOrEqual(50)
        expect(fov, `${layout} ${aspect}`).toBeLessThanOrEqual(80)
      }
    }
  })

  it('widens the view on portrait stages', () => {
    expect(composeFor(0.6, 'stacked').fov).toBeGreaterThan(composeFor(1.6, 'stacked').fov)
  })

  it('reads the layout CSS declares and defaults to full', () => {
    expect(parseLayout('stacked')).toBe('stacked')
    expect(parseLayout(' stacked ')).toBe('stacked')
    expect(parseLayout('full')).toBe('full')
    expect(parseLayout('intro')).toBe('intro')
    expect(parseLayout('')).toBe('full')
    expect(parseLayout('sideways')).toBe('full')
  })

  it('composes the fullscreen intro for every screen shape', () => {
    // Wide: the focal point clear of the left-aligned headline. Narrow: centred, below the headline.
    expect(composeFor(16 / 9, 'intro').shiftX).toBeGreaterThan(0)
    expect(composeFor(0.46, 'intro').shiftX).toBe(0)
    expect(composeFor(0.46, 'intro').shiftY).toBeLessThan(0)
    for (const aspect of [0.4, 0.46, 0.6, 0.75, 1, 1.33, 1.78, 2.4]) {
      const { fov } = composeFor(aspect, 'intro')
      expect(fov, `aspect ${aspect}`).toBeGreaterThanOrEqual(50)
      expect(fov, `aspect ${aspect}`).toBeLessThanOrEqual(80)
    }
    expect(composeFor(0.46, 'intro').fov).toBeGreaterThan(composeFor(1.78, 'intro').fov)
  })
})

describe('input tuning', () => {
  it('keeps the cursor gentle: eased, bounded, and settling', () => {
    expect(CURSOR.positionHalfLife).toBeGreaterThan(0.05)
    expect(CURSOR.energyHalfLife).toBeGreaterThan(CURSOR.velocityHalfLife)
    expect(CURSOR.maxRipples).toBeGreaterThanOrEqual(2)
    // A click wave is short and fades completely.
    expect(FIELD.rippleSeconds).toBeGreaterThan(1)
    expect(FIELD.rippleSeconds).toBeLessThan(4)
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

describe('scene tokens', () => {
  it.each(['dark', 'light'] as ThemeName[])('are all defined in the %s theme', (theme) => {
    for (const token of ['--scene-bg', '--scene-ink', '--scene-grid', '--scene-light-red', '--scene-light-blue']) {
      expect(resolveColor(token, theme), `${token} (${theme})`).not.toBeNull()
    }
    for (const token of ['--scene-glow', '--scene-bloom']) {
      expect(Number.isFinite(parseFloat(rawToken(token, theme) ?? '')), `${token} (${theme})`).toBe(true)
    }
  })

  it('draws neutral lines that contrast with the background in both themes', () => {
    for (const theme of ['dark', 'light'] as ThemeName[]) {
      expect(contrast(resolveColor('--scene-ink', theme)!, resolveColor('--scene-bg', theme)!), theme).toBeGreaterThan(7)
    }
  })

  it('keeps the red and blue lights visible against both backgrounds', () => {
    for (const theme of ['dark', 'light'] as ThemeName[]) {
      const bg = resolveColor('--scene-bg', theme)!
      expect(contrast(resolveColor('--scene-light-red', theme)!, bg), `red ${theme}`).toBeGreaterThan(3)
      expect(contrast(resolveColor('--scene-light-blue', theme)!, bg), `blue ${theme}`).toBeGreaterThan(3.5)
    }
  })

  it('lets light mode glow harder and bloom less than dark mode', () => {
    const glow = (theme: ThemeName) => parseFloat(rawToken('--scene-glow', theme)!)
    const bloom = (theme: ThemeName) => parseFloat(rawToken('--scene-bloom', theme)!)
    expect(glow('light')).toBeGreaterThan(glow('dark'))
    expect(bloom('light')).toBeLessThan(bloom('dark'))
  })
})
