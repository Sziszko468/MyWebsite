/**
 * The life of one remembered position (PROMPT 38.1): scrolling, leaving an entry before the browser or a frame has caught up, returning to it. The window, its frame clock
 * and the store are stand-ins, so the order of events is exactly the one each test states. What React does with it (when `leave` is called) is shown in a real browser by
 * tools/e2e/motion-journey.cjs; here it is only read from the source.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createScrollMemory, entryKeyOf, MAX_REMEMBERED, OWN_MOVE, readPositions, readsOnLeave, scrollAction, trackEntry, type ScrollView } from './scrollRestoration'

type Kind = 'scroll' | 'pagehide'

/** A window whose scroll events and animation frames happen only when a test says so, as a browser delivers them later than the movement itself. */
function fakeView() {
  const listeners: Record<Kind, Set<() => void>> = { scroll: new Set(), pagehide: new Set() }
  const frames = new Map<number, () => void>()
  const requested: (() => void)[] = []
  let ids = 0
  const view = {
    scrollY: 0,
    requestAnimationFrame(run: () => void) {
      frames.set(++ids, run)
      requested.push(run)
      return ids
    },
    cancelAnimationFrame(id: number) {
      frames.delete(id)
    },
    addEventListener(type: Kind, listener: () => void) {
      listeners[type].add(listener)
    },
    removeEventListener(type: Kind, listener: () => void) {
      listeners[type].delete(listener)
    },
  }
  const dispatch = (type: Kind) => [...listeners[type]].forEach((listener) => listener())
  return {
    view: view satisfies ScrollView,
    /** The window moves; nobody has been told yet. */
    move: (y: number) => void (view.scrollY = y),
    /** The browser announces the movement. */
    announce: () => dispatch('scroll'),
    /** The next animation frame. */
    frame: () => {
      const due = [...frames.values()]
      frames.clear()
      due.forEach((run) => run())
    },
    /** Moves, announces and lets the frame run: an ordinary, settled scroll. */
    scroll(y: number) {
      this.move(y)
      this.announce()
      this.frame()
    },
    hidePage: () => dispatch('pagehide'),
    waitingFrames: () => frames.size,
    /** Every frame callback ever asked for, cancelled ones too. */
    requested,
    listening: () => listeners.scroll.size + listeners.pagehide.size,
  }
}

function fakeStore() {
  const items = new Map<string, string>()
  let writes = 0
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes += 1
      items.set(key, value)
    },
    stored: () => readPositions({ getItem: (key: string) => items.get(key) ?? null }),
    raw: () => items.get('cc:scroll-positions'),
    writes: () => writes,
  }
}

/** A visit: one window, one memory, and the entry on screen. `go` does what the page frame does when the next entry is committed. */
function visit(first: string, store = fakeStore()) {
  const browser = fakeView()
  const memory = createScrollMemory(store)
  let tracked = trackEntry(first, browser.view, memory)
  return {
    browser,
    memory,
    store,
    go(next: string, { read = true, newPageAt }: { read?: boolean; newPageAt?: number } = {}) {
      tracked.leave(read) // before the document changes
      if (newPageAt !== undefined) {
        browser.move(newPageAt) // the next page is shorter, or is scrolled to its start
        browser.announce()
        browser.frame()
      }
      tracked.stop()
      tracked = trackEntry(next, browser.view, memory)
    },
    stop: () => tracked.stop(),
  }
}

describe('leaving an entry before the browser has caught up', () => {
  it('takes the latest position when the frame that would have recorded it has not run', () => {
    const v = visit('a')
    v.browser.scroll(600)
    v.browser.move(1400)
    v.browser.announce()
    expect(v.browser.waitingFrames()).toBe(1)
    v.go('b')
    expect(v.store.stored().a).toBe(1400)
    expect(v.browser.waitingFrames()).toBe(0)
  })

  it('takes it even when the browser has not announced the scroll at all', () => {
    const v = visit('a')
    v.browser.scroll(600)
    v.browser.move(1400)
    v.go('b')
    expect(v.store.stored().a).toBe(1400)
    expect(v.memory.saved('a')).toBe(1400)
  })

  it('reads the window itself, not the last reading', () => {
    const v = visit('a')
    v.browser.scroll(900)
    v.browser.move(120)
    v.go('b')
    expect(v.store.stored().a).toBe(120)
  })

  it('records a page that was never scrolled where it stands, as after a language switch that kept the place', () => {
    const v = visit('a')
    v.browser.move(900)
    v.go('b')
    expect(v.store.stored().a).toBe(900)
  })

  it('writes the store once for a leave', () => {
    const v = visit('a')
    v.browser.scroll(300)
    expect(v.store.writes()).toBe(0)
    v.go('b')
    expect(v.store.writes()).toBe(1)
  })
})

describe('each entry its own position', () => {
  it('never gives the entry being left the next page’s position', () => {
    const v = visit('a')
    v.browser.scroll(1400)
    v.go('b', { newPageAt: 0 })
    expect(v.store.stored().a).toBe(1400)
    expect(v.memory.saved('a')).toBe(1400)
  })

  it('lets nothing left over from an old entry write over a newer one, even a frame that runs after all', () => {
    const v = visit('a')
    v.browser.move(700)
    v.browser.announce()
    const late = v.browser.requested.at(-1)!
    v.go('b')
    v.browser.scroll(300)
    v.browser.move(50)
    late()
    expect(v.memory.saved('a')).toBe(700)
    expect(v.memory.saved('b')).toBe(300)
    v.go('c')
    expect(v.store.stored()).toEqual({ a: 700, b: 50 })
  })

  it('stops listening when an entry is stopped', () => {
    const v = visit('a')
    expect(v.browser.listening()).toBe(2)
    v.go('b')
    expect(v.browser.listening()).toBe(2)
    v.stop()
    expect(v.browser.listening()).toBe(0)
  })

  it('returns to the latest positions after rapid Back and Forward, none exchanged', () => {
    const v = visit('about')
    const expected: Record<string, number> = {}
    // Not one scroll is announced: every position is only ever seen as its entry is left.
    for (const [from, at, to] of [
      ['about', 500, 'services'],
      ['services', 1400, 'work'],
      ['work', 900, 'services'],
      ['services', 1200, 'about'],
      ['about', 700, 'services'],
      ['services', 1100, 'work'],
    ] as const) {
      if (expected[to] !== undefined) expect(v.memory.saved(to)).toBe(expected[to])
      v.browser.move(at)
      expected[from] = at
      v.go(to)
      if (expected[to] !== undefined) expect(v.memory.saved(to)).toBe(expected[to])
    }
    expect(v.store.stored()).toEqual({ about: 700, services: 1100, work: 900 })
    expect(createScrollMemory(v.store).saved('services')).toBe(1100)
  })

  it('keeps the newest sixty entries, in the same stored form', () => {
    const v = visit('k0')
    for (let i = 1; i <= MAX_REMEMBERED + 5; i++) {
      v.browser.move(i)
      v.go(`k${i}`)
    }
    const stored = JSON.parse(v.store.raw()!) as Record<string, number>
    expect(Object.keys(stored)).toHaveLength(MAX_REMEMBERED)
    expect(Object.keys(stored)[0]).toBe('k5')
    expect(stored[`k${MAX_REMEMBERED + 4}`]).toBe(MAX_REMEMBERED + 5)
  })
})

describe('when the window must not be read', () => {
  const next = { navigation: 'PUSH', key: 'k3j9', hash: '' } as const

  it('is read for a push, for Back and Forward, and for a fragment the router itself followed', () => {
    expect(readsOnLeave(next)).toBe(true)
    expect(readsOnLeave({ ...next, navigation: 'POP' })).toBe(true)
    expect(readsOnLeave({ ...next, hash: '#faq' })).toBe(true)
    // Back to the page the visit started on, which has the router's first key and no fragment.
    expect(readsOnLeave({ navigation: 'POP', key: 'default', hash: '' })).toBe(true)
  })

  it('is not read for a plain #link, which the browser follows itself, nor for a replaced entry', () => {
    expect(readsOnLeave({ navigation: 'POP', key: 'default', hash: '#motion' })).toBe(false)
    expect(readsOnLeave({ ...next, navigation: 'REPLACE' })).toBe(false)
  })

  it('keeps what scrolling recorded when the window has already jumped to a fragment', () => {
    const v = visit('a')
    v.browser.scroll(700)
    v.browser.move(6545)
    v.browser.announce()
    v.go('default /en/lab/design-system', { read: false })
    v.browser.frame()
    expect(v.store.stored()).toEqual({ a: 700 })
  })

  it('adds nothing for a replaced entry, so a typed search cannot push real entries out', () => {
    const v = visit('real')
    v.browser.move(800)
    v.go('typing-0')
    for (let i = 1; i <= MAX_REMEMBERED + 5; i++) v.go(`typing-${i}`, { read: false })
    expect(v.store.stored()).toEqual({ real: 800 })
  })
})

describe('a restore that is still waiting for its page', () => {
  function returned() {
    const store = fakeStore()
    store.setItem('cc:scroll-positions', JSON.stringify({ a: 1400 }))
    const v = visit('a', store)
    v.memory.hold('a', 0) // the page is not tall enough yet: it waits at the top
    return v
  }

  it('is not written over by the wait at the top, by scrolling to it or by leaving again', () => {
    const v = returned()
    v.browser.scroll(0)
    v.go('b')
    expect(v.store.stored().a).toBe(1400)
  })

  it('survives a reload during the wait', () => {
    const v = returned()
    v.browser.hidePage()
    expect(v.store.stored().a).toBe(1400)
  })

  it('believes a visitor who moves the page while it waits', () => {
    const v = returned()
    v.browser.scroll(OWN_MOVE)
    expect(v.memory.saved('a')).toBe(1400)
    v.browser.move(300)
    v.go('b')
    expect(v.store.stored().a).toBe(300)
  })

  it('records again once it has been placed, and never holds another entry', () => {
    const placed = returned()
    placed.memory.release()
    placed.browser.move(1400)
    placed.browser.scroll(1500)
    expect(placed.memory.saved('a')).toBe(1500)
    const other = returned()
    other.go('b')
    other.browser.scroll(0)
    expect(other.memory.saved('b')).toBe(0)
  })
})

describe('hiding and returning', () => {
  it('writes when the page is hidden, reading the window, and goes on if the page comes back', () => {
    const v = visit('a')
    v.browser.scroll(200)
    v.browser.move(450)
    v.browser.hidePage()
    expect(v.store.stored().a).toBe(450)
    v.browser.scroll(800)
    expect(v.memory.saved('a')).toBe(800)
  })

  it('reads nothing when it is only stopped: by then the window may show another page', () => {
    const v = visit('a')
    v.browser.scroll(300)
    v.browser.move(0)
    v.stop()
    expect(v.store.stored().a).toBe(300)
  })
})

describe('a store that cannot be used', () => {
  const refusing = {
    getItem: (): string => {
      throw new Error('SecurityError')
    },
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
  }

  it.each([
    ['throws', refusing],
    ['is not there', null],
  ])('does not stop a navigation when it %s, and the visit still remembers', (_, store) => {
    const browser = fakeView()
    const memory = createScrollMemory(store)
    const tracked = trackEntry('a', browser.view, memory)
    expect(() => {
      browser.scroll(640)
      browser.hidePage()
      tracked.leave(true)
      tracked.stop()
    }).not.toThrow()
    expect(memory.saved('a')).toBe(640)
  })
})

describe('what stays as it was', () => {
  it('opens a typed address at the top, restores a return and a reload, follows a fragment and keeps the place in another language', () => {
    expect(scrollAction({ samePage: false, hash: '', navigation: 'POP', fresh: true })).toBe('top')
    expect(scrollAction({ samePage: false, hash: '', navigation: 'POP', fresh: false })).toBe('restore')
    expect(scrollAction({ samePage: false, hash: '#faq', navigation: 'POP' })).toBe('hash')
    expect(scrollAction({ samePage: true, hash: '', navigation: 'PUSH' })).toBe('keep')
    expect(entryKeyOf('default', '/en/about/')).toBe('default /en/about')
  })
})

describe('how the page frame uses it', () => {
  const code = readFileSync(fileURLToPath(new URL('./ScrollManager.tsx', import.meta.url)), 'utf8')

  it('leaves an entry before React changes the document, not in an effect’s cleanup', () => {
    expect(code).toContain('getSnapshotBeforeUpdate(previous: LeaveWatchProps)')
    expect(code).toContain('if (previous.entry !== this.props.entry) this.props.onLeave(this.props.read)')
    expect(code).toContain('read={readsOnLeave({ navigation, key: location.key, hash })}')
    expect(code).not.toContain('useLayoutEffect')
  })

  it('holds a waiting restore and releases it when placed, moved or abandoned', () => {
    expect(code).toContain('memory.hold(entry, waitingAt)')
    expect(code.match(/memory\.release\(\)/g)).toHaveLength(3)
  })

  it('takes over the browser’s own restoration only while it is mounted', () => {
    expect(code).toContain("window.history.scrollRestoration = 'manual'")
    expect(code).toContain('window.history.scrollRestoration = previous')
  })
})
