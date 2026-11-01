import { describe, expect, it } from 'vitest'
import { localize, tri } from '../../../content/trilingual'
import { COOL_DOWN_SECONDS, FrameWatchdog, WARM_UP_SECONDS } from './frameWatchdog'
import {
  decideView,
  isAutonomous,
  motionScale,
  readViewPreference,
  storeViewPreference,
  VIEW_STORAGE_KEY,
} from './labMode'
import { chooseDpr, LAB_PROFILES, labProfileFor, pickLabTier } from './labProfile'
import { LabPointer } from './LabPointer'

describe('the Lab quality profiles', () => {
  it('get lighter from high to low in every budget', () => {
    const { high, medium, low } = LAB_PROFILES
    for (const key of [
      'maxDpr',
      'maxPixels',
      'heroDetail',
      'heroDust',
      'particles',
      'liquidDetail',
      'typeLayers',
      'spaceStreaks',
      'spaceDust',
    ] as const) {
      expect(high[key], key).toBeGreaterThan(medium[key])
      expect(medium[key], key).toBeGreaterThan(low[key])
    }
    expect(labProfileFor('low')).toBe(low)
  })

  it('keep every count a whole number and every pixel ratio sane', () => {
    for (const profile of Object.values(LAB_PROFILES)) {
      for (const key of [
        'heroDetail',
        'heroDust',
        'particles',
        'fluidCols',
        'liquidDetail',
        'typeLayers',
        'spaceStreaks',
        'spaceDust',
        'spacePlanes',
        'spaceRings',
      ] as const) {
        expect(Number.isInteger(profile[key]), `${profile.tier}.${key}`).toBe(true)
      }
      expect(profile.maxDpr).toBeGreaterThanOrEqual(1)
      expect(profile.chromaticDpr).toBeLessThanOrEqual(profile.maxDpr)
    }
  })

  it('give a phone a lighter tier than a workstation', () => {
    expect(pickLabTier({ width: 390, coarsePointer: true, saveData: false, cores: 8, memory: 8 })).toBe('medium')
    expect(pickLabTier({ width: 390, coarsePointer: true, saveData: false, cores: 4 })).toBe('low')
    expect(pickLabTier({ width: 1920, coarsePointer: false, saveData: false, cores: 12, memory: 8 })).toBe('high')
    expect(pickLabTier({ width: 1920, coarsePointer: false, saveData: true })).toBe('low')
  })

  it('choose a pixel ratio inside the budget and never below the floor', () => {
    const profile = LAB_PROFILES.medium
    // A 4K window on a 2x screen would ask for 8.3 million pixels; the budget caps it.
    const dpr = chooseDpr(profile, 1920, 1080, 2)
    expect(1920 * 1080 * dpr * dpr).toBeLessThanOrEqual(profile.maxPixels * 1.001)
    expect(chooseDpr(profile, 390, 844, 3)).toBeLessThanOrEqual(profile.maxDpr)
    expect(chooseDpr(profile, 390, 844, 1, 0.1)).toBe(0.55)
    expect(chooseDpr(profile, 0, 0, 1)).toBeGreaterThan(0)
  })
})

describe('how a stage is shown', () => {
  const base = { preference: null, reducedMotion: false, webgl: true, failed: false } as const

  it('is live by default and calm under reduced motion', () => {
    expect(decideView(base)).toEqual({ view: 'live', reason: null })
    expect(decideView({ ...base, reducedMotion: true })).toEqual({ view: 'calm', reason: null })
  })

  it('is still, with the reason, without WebGL or after a failure, whatever the visitor chose', () => {
    expect(decideView({ ...base, webgl: false, preference: 'live' })).toEqual({ view: 'still', reason: 'no-webgl' })
    expect(decideView({ ...base, failed: true, preference: 'live' })).toEqual({ view: 'still', reason: 'failed' })
  })

  it('follows an explicit choice, even against the system setting', () => {
    expect(decideView({ ...base, reducedMotion: true, preference: 'live' }).view).toBe('live')
    expect(decideView({ ...base, preference: 'still' })).toEqual({ view: 'still', reason: 'user' })
    expect(decideView({ ...base, preference: 'calm' }).view).toBe('calm')
  })

  it('moves less, then not at all, from live to calm to still', () => {
    expect(motionScale('live')).toBe(1)
    expect(motionScale('calm')).toBeLessThan(1)
    expect(motionScale('calm')).toBeGreaterThan(0)
    expect(motionScale('still')).toBe(0)
    expect(isAutonomous('live')).toBe(true)
    expect(isAutonomous('calm')).toBe(false)
  })

  it('remembers the choice and survives a blocked store', () => {
    const memory = new Map<string, string>()
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
    }
    storeViewPreference(storage, 'calm')
    expect(memory.get(VIEW_STORAGE_KEY)).toBe('calm')
    expect(readViewPreference(storage)).toBe('calm')

    memory.set(VIEW_STORAGE_KEY, 'nonsense')
    expect(readViewPreference(storage)).toBeNull()

    const blocked = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(readViewPreference(blocked)).toBeNull()
    expect(() => storeViewPreference(blocked, 'live')).not.toThrow()
    expect(readViewPreference(null)).toBeNull()
  })
})

describe('the Lab pointer', () => {
  it('eases towards the target and never jumps', () => {
    const pointer = new LabPointer()
    pointer.setTarget(0, 0)
    pointer.setTarget(1, 0)
    pointer.update(1 / 60)
    expect(pointer.x).toBeGreaterThan(0)
    expect(pointer.x).toBeLessThan(1)
    for (let i = 0; i < 120; i++) pointer.update(1 / 60)
    expect(pointer.x).toBeCloseTo(1, 2)
  })

  it('has energy while moving and lets it drain once it rests, then settles', () => {
    const pointer = new LabPointer()
    pointer.setTarget(-1, 0)
    for (let i = 0; i < 20; i++) {
      pointer.setTarget(-1 + i * 0.1, 0)
      pointer.update(1 / 60)
    }
    expect(pointer.energy).toBeGreaterThan(0.2)
    expect(pointer.settled).toBe(false)
    for (let i = 0; i < 600; i++) pointer.update(1 / 60)
    expect(pointer.energy).toBeLessThan(0.003)
    // Resting over the stage, fully present, counts as settled: a calm canvas may stop drawing.
    expect(pointer.settled).toBe(true)
  })

  it('is present while over the stage and fades after it leaves', () => {
    const pointer = new LabPointer()
    pointer.setTarget(0, 0)
    for (let i = 0; i < 60; i++) pointer.update(1 / 60)
    expect(pointer.presence).toBeGreaterThan(0.95)
    pointer.leave()
    for (let i = 0; i < 300; i++) pointer.update(1 / 60)
    expect(pointer.presence).toBeLessThan(0.01)
  })

  it('keeps the newest four pulses and ages them out', () => {
    const pointer = new LabPointer()
    for (let i = 0; i < 6; i++) pointer.pulse(i * 0.1, 0, i, 1)
    expect(pointer.pulseVersion).toBe(6)
    const times = pointer.pulses.map((pulse) => pulse.time).sort((a, b) => a - b)
    expect(times).toEqual([2, 3, 4, 5])
    expect(pointer.newestPulse(5.2, 1)?.time).toBe(5)
    expect(pointer.hasPulses(5.2, 1)).toBe(true)
    expect(pointer.hasPulses(20, 1)).toBe(false)
  })

  it('gathers a drag while pressed and hands it over once', () => {
    const pointer = new LabPointer()
    pointer.press(0, 0, false)
    pointer.setTarget(0.2, 0.1)
    pointer.setTarget(0.5, 0.1)
    const out = { x: 0, y: 0 }
    pointer.takeDrag(out)
    expect(out.x).toBeCloseTo(0.5)
    expect(out.y).toBeCloseTo(0.1)
    pointer.takeDrag(out)
    expect(out.x).toBe(0)
    pointer.release()
    pointer.setTarget(0.9, 0.9)
    pointer.takeDrag(out)
    expect(out.x).toBe(0)
  })

  it('clamps wild positions and reports activity', () => {
    const pointer = new LabPointer()
    let activity = 0
    pointer.onActivity = () => activity++
    pointer.setTarget(50, -50)
    pointer.update(1)
    expect(Math.abs(pointer.x)).toBeLessThanOrEqual(1.4)
    expect(Math.abs(pointer.y)).toBeLessThanOrEqual(1.4)
    expect(activity).toBeGreaterThan(0)
    pointer.update(0)
    pointer.rest()
    expect(pointer.energy).toBe(0)
    expect(pointer.down).toBe(false)
  })
})

describe('localize', () => {
  it('picks one language out of nested texts and leaves the rest alone', () => {
    const text = {
      title: tri('Szia', 'Hi', 'Hoi'),
      list: [tri('egy', 'one', 'een')],
      deep: { id: 7, label: tri('a', 'b', 'c') },
    }
    expect(localize(text, 'nl')).toEqual({ title: 'Hoi', list: ['een'], deep: { id: 7, label: 'c' } })
    expect(localize(text, 'hu').title).toBe('Szia')
  })
})

describe('the frame watchdog', () => {
  const run = (watchdog: FrameWatchdog, frameMs: number, seconds: number) => {
    const reports: Array<{ at: number; averageMs: number }> = []
    let elapsed = 0
    while (elapsed < seconds) {
      const report = watchdog.tick(frameMs / 1000)
      elapsed += frameMs / 1000
      if (report !== null) reports.push({ at: elapsed, averageMs: report })
    }
    return reports
  }

  it('says nothing about a scene that holds 60 fps, however long it runs', () => {
    expect(run(new FrameWatchdog(), 16.7, 120)).toEqual([])
  })

  it('does not judge during the warm-up, then helps a slow machine within seconds, not minutes', () => {
    const reports = run(new FrameWatchdog(), 140, 40)
    expect(reports.length).toBeGreaterThan(0)
    expect(reports[0].at).toBeGreaterThan(WARM_UP_SECONDS)
    expect(reports[0].at).toBeLessThan(8)
    expect(reports[0].averageMs).toBeGreaterThan(100)
  })

  it('asks twice for a merely slow scene and waits for each remedy to show before asking again', () => {
    const reports = run(new FrameWatchdog(), 38, 40)
    expect(reports.length).toBeGreaterThan(1)
    for (let i = 1; i < reports.length; i++)
      expect(reports[i].at - reports[i - 1].at).toBeGreaterThanOrEqual(COOL_DOWN_SECONDS)
  })

  it('does not count a pause (a hidden tab) as slowness, and one hitch does not decide', () => {
    const watchdog = new FrameWatchdog()
    const reports = run(watchdog, 16.7, 10)
    expect(reports).toEqual([])
    expect(watchdog.tick(3)).toBeNull()
    expect(run(watchdog, 16.7, 10)).toEqual([])
    // A single 200 ms hitch in a smooth run is only one frame of many.
    for (let i = 0; i < 300; i++) expect(watchdog.tick(i === 100 ? 0.2 : 0.0167)).toBeNull()
  })
})
