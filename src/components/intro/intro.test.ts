import { describe, expect, it } from 'vitest'
import { introConfig, type IntroConfig } from '../../config/intro'
import { contrast, rawToken, resolveColor, type ThemeName } from '../../test/tokens'
import { easeInOutCubic, exitProgress } from './introTransition'
import {
  INTRO_KEYS,
  markIntroSeen,
  readIntroOverride,
  readSkipPreference,
  shouldShowIntro,
  writeSkipPreference,
  type IntroStores,
  type KeyValueStore,
} from './introPolicy'

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  }
}

function freshStores(): IntroStores & { persistent: ReturnType<typeof memoryStore>; session: ReturnType<typeof memoryStore> } {
  return { persistent: memoryStore(), session: memoryStore() }
}

/** A store that throws on every access, like storage blocked by a browser policy. */
const blocked: KeyValueStore = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
}

const config = (overrides: Partial<IntroConfig> = {}): IntroConfig => ({ ...introConfig, ...overrides })

describe('intro frequency', () => {
  it('is configured, not hard-coded: the default is the first visit, with a way to skip', () => {
    expect(introConfig.frequency).toBe('first-visit')
    expect(introConfig.allowSkip).toBe(true)
  })

  it('shows on the first visit and not again once entered', () => {
    const stores = freshStores()
    const first = config({ frequency: 'first-visit' })
    expect(shouldShowIntro(first, stores)).toBe(true)
    markIntroSeen(first, stores)
    expect(shouldShowIntro(first, stores)).toBe(false)
    expect(stores.persistent.data.get(INTRO_KEYS.seen)).toBe('1')
    expect(stores.session.data.size).toBe(0)
  })

  it('shows again in a new browser session when set to every session', () => {
    const stores = freshStores()
    const each = config({ frequency: 'every-session' })
    expect(shouldShowIntro(each, stores)).toBe(true)
    markIntroSeen(each, stores)
    expect(shouldShowIntro(each, stores)).toBe(false)
    // A new session starts with an empty session store; the persistent one is untouched.
    expect(shouldShowIntro(each, { persistent: stores.persistent, session: memoryStore() })).toBe(true)
    expect(stores.persistent.data.size).toBe(0)
  })

  it('never shows when switched off, whatever is remembered', () => {
    expect(shouldShowIntro(config({ frequency: 'never' }), freshStores())).toBe(false)
  })

  it('leaves nothing behind when it is not going to be shown', () => {
    const stores = freshStores()
    markIntroSeen(config({ frequency: 'never' }), stores)
    expect(stores.persistent.data.size + stores.session.data.size).toBe(0)
  })
})

describe('skipping the intro', () => {
  it('remembers "do not show again" and honours it over the frequency', () => {
    const stores = freshStores()
    expect(readSkipPreference(stores)).toBe(false)
    writeSkipPreference(stores, true)
    expect(readSkipPreference(stores)).toBe(true)
    expect(shouldShowIntro(config({ frequency: 'every-session' }), stores)).toBe(false)
    expect(shouldShowIntro(config({ frequency: 'first-visit' }), stores)).toBe(false)
  })

  it('can be undone', () => {
    const stores = freshStores()
    writeSkipPreference(stores, true)
    writeSkipPreference(stores, false)
    expect(readSkipPreference(stores)).toBe(false)
    expect(shouldShowIntro(config(), stores)).toBe(true)
  })

  it('is ignored when the configuration offers no skip', () => {
    const stores = freshStores()
    writeSkipPreference(stores, true)
    expect(shouldShowIntro(config({ allowSkip: false }), stores)).toBe(true)
  })
})

describe('unavailable storage', () => {
  const stores: IntroStores = { persistent: blocked, session: blocked }

  it('behaves as if nothing had been remembered, without throwing', () => {
    expect(shouldShowIntro(config(), stores)).toBe(true)
    expect(() => markIntroSeen(config(), stores)).not.toThrow()
    expect(() => writeSkipPreference(stores, true)).not.toThrow()
    expect(readSkipPreference(stores)).toBe(false)
  })

  it('copes with no storage at all', () => {
    const none: IntroStores = { persistent: null, session: null }
    expect(shouldShowIntro(config({ frequency: 'every-session' }), none)).toBe(true)
    expect(() => markIntroSeen(config({ frequency: 'every-session' }), none)).not.toThrow()
  })
})

describe('development override', () => {
  it('forces the intro on or off from the query, whatever was remembered', () => {
    const stores = freshStores()
    markIntroSeen(config(), stores)
    writeSkipPreference(stores, true)
    expect(readIntroOverride('?intro=1')).toBe('show')
    expect(readIntroOverride('?intro=0')).toBe('hide')
    expect(readIntroOverride('?intro=maybe')).toBeUndefined()
    expect(readIntroOverride('')).toBeUndefined()
    expect(shouldShowIntro(config(), stores, 'show')).toBe(true)
    expect(shouldShowIntro(config(), freshStores(), 'hide')).toBe(false)
  })
})

describe('exit transition', () => {
  it('runs from 0 to 1 and stays within it', () => {
    expect(exitProgress(0, 1000)).toBe(0)
    expect(exitProgress(1000, 1000)).toBe(1)
    expect(exitProgress(-50, 1000)).toBe(0)
    expect(exitProgress(5000, 1000)).toBe(1)
  })

  it('is eased: slow at the start and the end, quick in the middle', () => {
    expect(exitProgress(100, 1000)).toBeLessThan(0.1)
    expect(exitProgress(500, 1000)).toBeCloseTo(0.5, 6)
    expect(exitProgress(900, 1000)).toBeGreaterThan(0.9)
    let previous = 0
    for (let ms = 0; ms <= 1000; ms += 10) {
      const value = exitProgress(ms, 1000)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
    expect(easeInOutCubic(0.25)).toBeCloseTo(0.0625, 6)
  })

  it('is a plain linear fade under reduced motion', () => {
    expect(exitProgress(80, 320, true)).toBeCloseTo(0.25, 6)
    expect(exitProgress(160, 320, true)).toBeCloseTo(0.5, 6)
  })

  it('never divides by zero', () => {
    expect(Number.isFinite(exitProgress(10, 0))).toBe(true)
  })

  it('lasts between 700 and 1200 ms, with a short plain one for reduced motion', () => {
    expect(introConfig.exitMs).toBeGreaterThanOrEqual(700)
    expect(introConfig.exitMs).toBeLessThanOrEqual(1200)
    expect(introConfig.exitMsReduced).toBeLessThan(introConfig.exitMs)
    expect(introConfig.exitMsReduced).toBeGreaterThan(0)
  })
})

describe('intro text over the field', () => {
  // The intro puts the same scrim over the field as the hero does, so the same worst case
  // applies: the brightest possible pixel behind the text. The headline, the supporting line and
  // the hint use these tokens; the entry button's rule and arrow are accent coloured.
  const scrim = parseFloat(rawToken('--scene-scrim') ?? '0') / 100
  const worst = (theme: ThemeName) => (theme === 'dark' ? '#ffffff' : '#000000')
  const mix = (a: string, b: string, weightA: number) => {
    const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
    const parts = [0, 1, 2].map((i) => Math.round(channel(a, i) * weightA + channel(b, i) * (1 - weightA)))
    return `#${parts.map((v) => v.toString(16).padStart(2, '0')).join('')}`
  }
  const behind = (theme: ThemeName) => mix(resolveColor('--color-bg', theme)!, worst(theme), scrim)

  it.each(['dark', 'light'] as ThemeName[])('keeps the headline and the entry label at AAA in the %s theme', (theme) => {
    expect(contrast(resolveColor('--color-text', theme)!, behind(theme))).toBeGreaterThanOrEqual(7)
  })

  it.each(['dark', 'light'] as ThemeName[])('keeps the supporting line and the hint at AA in the %s theme', (theme) => {
    expect(contrast(resolveColor('--color-text-secondary', theme)!, behind(theme))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['dark', 'light'] as ThemeName[])('keeps the entry arrow visible (3:1) in the %s theme', (theme) => {
    expect(contrast(resolveColor('--color-accent-text', theme)!, behind(theme))).toBeGreaterThanOrEqual(3)
  })

  it.each(['dark', 'light'] as ThemeName[])('keeps the hovered entry label readable on its accent fill in the %s theme', (theme) => {
    expect(contrast(resolveColor('--color-on-accent', theme)!, resolveColor('--color-accent', theme)!)).toBeGreaterThanOrEqual(4.5)
  })
})
