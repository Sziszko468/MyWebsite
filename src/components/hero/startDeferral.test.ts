import { describe, expect, it } from 'vitest'
import { START_DEFAULTS, whenFirstScreenSettled, type StartEnv } from './startDeferral'

/** A clock the test drives by hand, and the browser events the gate listens to. */
function fakeEnv(options: { loaded: boolean; paintSupport: boolean }) {
  let now = 0
  let nextId = 1
  const timers = new Map<number, { at: number; callback: () => void }>()
  const loadListeners: (() => void)[] = []
  const paintListeners: (() => void)[] = []
  let idleRuns = 0
  let readyState: DocumentReadyState = options.loaded ? 'complete' : 'loading'
  const env: StartEnv = {
    readyState: () => readyState,
    onLoad: (listener) => {
      loadListeners.push(listener)
      return () => loadListeners.splice(loadListeners.indexOf(listener), 1)
    },
    onLargestPaint: options.paintSupport
      ? (listener) => {
          paintListeners.push(listener)
          return () => paintListeners.splice(paintListeners.indexOf(listener), 1)
        }
      : null,
    setTimeout: (callback, ms) => {
      const id = nextId++
      timers.set(id, { at: now + ms, callback })
      return id
    },
    clearTimeout: (id) => void timers.delete(id),
    // The test's idle moment comes at once, so only the timers decide when it starts.
    idle: (callback) => {
      idleRuns++
      const id = nextId++
      timers.set(id, { at: now, callback })
      return () => void timers.delete(id)
    },
  }
  return {
    env,
    advance(ms: number) {
      const end = now + ms
      for (;;) {
        const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        now = Math.max(now, due[1].at)
        timers.delete(due[0])
        due[1].callback()
      }
      now = end
    },
    load() {
      readyState = 'complete'
      for (const listener of [...loadListeners]) listener()
    },
    paint() {
      for (const listener of [...paintListeners]) listener()
    },
    get idleRuns() {
      return idleRuns
    },
    get pending() {
      return timers.size + loadListeners.length + paintListeners.length
    },
  }
}

const { settleMs, maxWaitMs } = START_DEFAULTS

describe('whenFirstScreenSettled', () => {
  it('starts once the page has loaded and a settle time has passed with no new paint', () => {
    const clock = fakeEnv({ loaded: false, paintSupport: true })
    let started = 0
    whenFirstScreenSettled(() => started++, START_DEFAULTS, clock.env)
    clock.advance(settleMs * 2)
    expect(started, 'not before the page has loaded').toBe(0)
    clock.load()
    clock.advance(settleMs - 1)
    expect(started).toBe(0)
    clock.advance(1)
    expect(started).toBe(1)
  })

  it('waits again for every larger paint of the first screen', () => {
    const clock = fakeEnv({ loaded: true, paintSupport: true })
    let started = 0
    whenFirstScreenSettled(() => started++, START_DEFAULTS, clock.env)
    clock.advance(settleMs - 50)
    clock.paint()
    clock.advance(settleMs - 50)
    clock.paint()
    clock.advance(settleMs - 1)
    expect(started).toBe(0)
    clock.advance(1)
    expect(started).toBe(1)
  })

  it('never waits longer than the limit, however often the screen paints', () => {
    const clock = fakeEnv({ loaded: true, paintSupport: true })
    let started = 0
    whenFirstScreenSettled(() => started++, START_DEFAULTS, clock.env)
    for (let t = 0; t < maxWaitMs; t += settleMs / 2) {
      clock.advance(settleMs / 2)
      clock.paint()
    }
    expect(started).toBe(1)
  })

  it('starts after the settle time alone when the browser cannot report paints', () => {
    const clock = fakeEnv({ loaded: true, paintSupport: false })
    let started = 0
    whenFirstScreenSettled(() => started++, START_DEFAULTS, clock.env)
    clock.advance(settleMs)
    expect(started).toBe(1)
  })

  it('starts once, and leaves nothing running afterwards', () => {
    const clock = fakeEnv({ loaded: true, paintSupport: true })
    let started = 0
    whenFirstScreenSettled(() => started++, START_DEFAULTS, clock.env)
    clock.advance(maxWaitMs * 2)
    clock.paint()
    clock.load()
    clock.advance(maxWaitMs)
    expect(started).toBe(1)
    expect(clock.pending).toBe(0)
  })

  it('does not start after it was cancelled (the visitor left the page)', () => {
    const clock = fakeEnv({ loaded: true, paintSupport: true })
    let started = 0
    const cancel = whenFirstScreenSettled(() => started++, START_DEFAULTS, clock.env)
    clock.advance(settleMs / 2)
    cancel()
    clock.advance(maxWaitMs * 2)
    expect(started).toBe(0)
    expect(clock.pending).toBe(0)
  })
})
