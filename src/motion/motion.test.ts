import { afterEach, describe, expect, it, vi } from 'vitest'
import { inViewStats, observeInView, observeOnce } from './inView'
import { MAX_CHARS, resolveVariant, splitGraphemes, splitParts, splitWords } from './kinetic'
import { LOADING_DELAY_MS, pendingCount, track } from './loading'
import { LABEL_OFFSET, NO_LABEL_SELECTOR, labelFor, placeLabel } from './cursorLabel'
import { MAX_PULL, MIN_MAGNETIC, isMagnetic, magneticOffset } from './magnetic'
import { MAX_REMEMBERED, readPositions, remember, restoreTarget, scrollAction, writePositions } from './scrollRestoration'
import { passOffset, passProgress, scrollSubscribers, subscribeScroll } from './scroll'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** A stand-in for IntersectionObserver that records what it watches and lets a test report visibility. */
function fakeObserver() {
  const created: Array<{ options: IntersectionObserverInit | undefined; watching: Set<Element>; fire: (target: Element, isIntersecting: boolean) => void }> = []
  class Fake {
    watching = new Set<Element>()
    constructor(callback: (entries: Array<Partial<IntersectionObserverEntry>>) => void, options?: IntersectionObserverInit) {
      created.push({ options, watching: this.watching, fire: (target, isIntersecting) => callback([{ target, isIntersecting }]) })
    }
    observe(element: Element) {
      this.watching.add(element)
    }
    unobserve(element: Element) {
      this.watching.delete(element)
    }
    disconnect() {
      this.watching.clear()
    }
  }
  vi.stubGlobal('IntersectionObserver', Fake)
  return created
}

describe('the shared in-view observer', () => {
  it('uses one observer for any number of elements with the same options, and lets go when nobody watches', () => {
    const created = fakeObserver()
    const [a, b, c] = [{ getBoundingClientRect: () => ({}) }, { getBoundingClientRect: () => ({}) }, { getBoundingClientRect: () => ({}) }] as unknown as Element[]
    const options = { threshold: 0.5, rootMargin: '1px' }
    const stopA = observeInView(a, () => undefined, options)
    const stopB = observeInView(b, () => undefined, options)
    observeInView(c, () => undefined, { threshold: 0.5, rootMargin: '2px' })
    expect(created).toHaveLength(2)
    expect(inViewStats().elements).toBeGreaterThanOrEqual(3)
    stopA()
    stopB()
    expect(created[0].watching.size).toBe(0)
  })

  it('tells each listener about its own element, and observeOnce fires once and stops watching', () => {
    const created = fakeObserver()
    const element = {} as Element
    const other = {} as Element
    const seen: string[] = []
    const options = { threshold: 0.33, rootMargin: '3px' }
    observeInView(other, () => seen.push('other'), options)
    observeOnce(element, () => seen.push('once'), options)
    const observer = created[created.length - 1]
    observer.fire(element, false)
    expect(seen).toEqual([])
    observer.fire(element, true)
    observer.fire(element, true)
    expect(seen).toEqual(['once'])
    expect(observer.watching.has(element)).toBe(false)
    expect(observer.watching.has(other)).toBe(true)
  })

  it('reports an element as in view at once where there is no IntersectionObserver, so nothing is left hidden', () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const seen: boolean[] = []
    observeInView({ getBoundingClientRect: () => ({}) } as unknown as Element, (entry) => seen.push(entry.isIntersecting))
    expect(seen).toEqual([true])
  })
})

describe('scroll-linked progress', () => {
  it('measures an element’s pass through the viewport: 0 as it enters, 1 as it leaves, clamped', () => {
    expect(passProgress(800, 200, 800)).toBe(0)
    expect(passProgress(-200, 200, 800)).toBe(1)
    expect(passProgress(300, 200, 800)).toBeCloseTo(0.5)
    expect(passProgress(2000, 200, 800)).toBe(0)
    expect(passProgress(-900, 200, 800)).toBe(1)
    expect(passProgress(0, 0, 0)).toBe(0)
    expect(passOffset(0)).toBe(-1)
    expect(passOffset(0.5)).toBe(0)
    expect(passOffset(1)).toBe(1)
  })

  it('shares one passive listener and one frame between all followers, reads before it writes, and detaches at zero', () => {
    const added: Array<[string, unknown]> = []
    const removed: string[] = []
    const frames: Array<() => void> = []
    vi.stubGlobal('window', {
      addEventListener: (type: string, _fn: unknown, options: unknown) => added.push([type, options]),
      removeEventListener: (type: string) => removed.push(type),
    })
    vi.stubGlobal('requestAnimationFrame', (fn: () => void) => frames.push(fn))
    vi.stubGlobal('cancelAnimationFrame', () => undefined)

    const order: string[] = []
    const stopA = subscribeScroll(() => {
      order.push('read A')
      return () => order.push('write A')
    })
    const stopB = subscribeScroll(() => {
      order.push('read B')
      return () => order.push('write B')
    })
    expect(scrollSubscribers()).toBe(2)
    // One listener for scroll and one for resize, both passive, however many followers there are.
    expect(added.map(([type]) => type)).toEqual(['scroll', 'resize'])
    expect(added.every(([, options]) => (options as { passive: boolean }).passive)).toBe(true)
    // One frame was scheduled for both; running it reads everything first and then writes.
    expect(frames).toHaveLength(1)
    frames[0]()
    expect(order).toEqual(['read A', 'read B', 'write A', 'write B'])

    stopA()
    expect(removed).toEqual([])
    stopB()
    expect(removed).toEqual(['scroll', 'resize'])
    expect(scrollSubscribers()).toBe(0)
  })
})

describe('kinetic type', () => {
  it('splits a headline into words and each word into the pieces a line may break between', () => {
    expect(splitWords('  Build  something\tthat matters. ')).toEqual(['Build', 'something', 'that', 'matters.'])
    expect(splitWords('')).toEqual([])
    expect(splitParts('Webalkalmazás-fejlesztés')).toEqual(['Webalkalmazás-', 'fejlesztés'])
    expect(splitParts('API-k')).toEqual(['API-', 'k'])
    expect(splitParts('plain')).toEqual(['plain'])
    expect(splitParts('a–b—c').join('')).toBe('a–b—c')
  })

  it('keeps every piece’s text: joining the pieces gives the words back, so the sentence is unchanged', () => {
    for (const text of ['Weboldalfejlesztés', 'API & Integrations', 'Webapplicatie-ontwikkeling', 'Nem csak kódot írok.', "Let’s talk"]) {
      const rebuilt = splitWords(text).map((word) => splitParts(word).join('')).join(' ')
      expect(rebuilt).toBe(text.replace(/\s+/g, ' ').trim())
    }
  })

  it('splits letters as a reader sees them: an accent or an emoji stays in one piece', () => {
    expect(splitGraphemes('kódot')).toEqual(['k', 'ó', 'd', 'o', 't'])
    expect(splitGraphemes('éa').length).toBeLessThanOrEqual(2)
    expect(splitGraphemes('👍🏽x')).toHaveLength(2)
  })

  it('moves letter by letter only for a short headline', () => {
    expect(resolveVariant('chars', 'Spendly')).toBe('chars')
    expect(resolveVariant('chars', 'x'.repeat(MAX_CHARS))).toBe('chars')
    expect(resolveVariant('chars', 'x'.repeat(MAX_CHARS + 1))).toBe('mask')
    expect(resolveVariant('words', 'x'.repeat(100))).toBe('words')
    expect(resolveVariant('mask', 'short')).toBe('mask')
  })
})

describe('the loading count', () => {
  it('counts what is arriving, and stops counting when it has arrived or failed', async () => {
    const before = pendingCount()
    let resolve!: (value: number) => void
    const slow = track(new Promise<number>((done) => (resolve = done)))
    expect(pendingCount()).toBe(before + 1)
    const broken = track(Promise.reject(new Error('chunk failed')))
    broken.catch(() => undefined)
    expect(pendingCount()).toBe(before + 2)
    resolve(1)
    await slow
    await broken.catch(() => undefined)
    await Promise.resolve()
    expect(pendingCount()).toBe(before)
  })

  it('waits a moment before showing anything, so a fast load flashes nothing', () => {
    expect(LOADING_DELAY_MS).toBeGreaterThanOrEqual(100)
    expect(LOADING_DELAY_MS).toBeLessThanOrEqual(250)
  })
})

describe('the magnetic pull', () => {
  const box = { left: 100, top: 100, width: 200, height: 56 }

  it('pulls toward the pointer by a share of its distance from the centre, never past the cap', () => {
    expect(magneticOffset(200, 128, box)).toEqual({ x: 0, y: 0 })
    const near = magneticOffset(250, 128, box)
    expect(near.x).toBeGreaterThan(0)
    expect(near.y).toBe(0)
    expect(Math.abs(magneticOffset(10_000, 10_000, box).x)).toBe(MAX_PULL)
    expect(magneticOffset(-10_000, -10_000, box)).toEqual({ x: -MAX_PULL, y: -MAX_PULL })
  })

  it('scales with the scope’s intensity, and not at all when motion is reduced', () => {
    const full = magneticOffset(290, 150, box, 1)
    const half = magneticOffset(290, 150, box, 0.5)
    expect(Math.abs(half.x)).toBeLessThan(Math.abs(full.x))
    expect(magneticOffset(290, 150, box, 0)).toEqual({ x: 0, y: 0 })
  })

  it('leaves small controls alone: only a large, deliberate target may lean', () => {
    expect(isMagnetic({ width: MIN_MAGNETIC.width, height: MIN_MAGNETIC.height })).toBe(true)
    expect(isMagnetic({ width: 44, height: 44 })).toBe(false)
    expect(isMagnetic({ width: 300, height: 30 })).toBe(false)
  })
})

describe('the cursor label', () => {
  it('sits just below and right of the pointer, and flips to stay inside the window', () => {
    const size = { width: 100, height: 24 }
    const viewport = { width: 1000, height: 700 }
    expect(placeLabel({ x: 200, y: 200 }, size, viewport)).toEqual({ x: 200 + LABEL_OFFSET.x, y: 200 + LABEL_OFFSET.y })
    const right = placeLabel({ x: 980, y: 200 }, size, viewport)
    expect(right.x).toBeLessThan(980)
    const bottom = placeLabel({ x: 200, y: 690 }, size, viewport)
    expect(bottom.y).toBeLessThan(690)
    const corner = placeLabel({ x: 0, y: 0 }, size, { width: 50, height: 20 })
    expect(corner.x).toBeGreaterThanOrEqual(8)
    expect(corner.y).toBeGreaterThanOrEqual(8)
  })

  it('shows the nearest data-cursor text, and nothing over a field, a selection area or an opt-out', () => {
    const element = (matches: { [selector: string]: { dataset: { cursor?: string } } | null }) =>
      ({ closest: (selector: string) => matches[selector] ?? null }) as unknown as Element
    expect(labelFor(null)).toBeNull()
    expect(labelFor(element({ '[data-cursor]': { dataset: { cursor: ' Open ' } } }))).toBe('Open')
    expect(labelFor(element({ '[data-cursor]': { dataset: { cursor: '   ' } } }))).toBeNull()
    expect(labelFor(element({}))).toBeNull()
    expect(labelFor(element({ [NO_LABEL_SELECTOR]: { dataset: {} }, '[data-cursor]': { dataset: { cursor: 'Open' } } }))).toBeNull()
    for (const field of ['input', 'textarea', 'select']) expect(NO_LABEL_SELECTOR).toContain(field)
  })
})

describe('where Back and Forward return to', () => {
  it('remembers positions by entry, keeps only the most recent, and re-setting moves an entry to the end', () => {
    let positions = {}
    for (let i = 0; i < MAX_REMEMBERED + 10; i++) positions = remember(positions, `k${i}`, i * 10)
    expect(Object.keys(positions)).toHaveLength(MAX_REMEMBERED)
    expect(Object.keys(positions)[0]).toBe('k10')
    const again = remember(positions, 'k10', 5)
    expect(Object.keys(again).pop()).toBe('k10')
    expect(remember({}, 'a', -50)).toEqual({ a: 0 })
    expect(remember({}, 'a', 12.6)).toEqual({ a: 13 })
  })

  it('reads and writes the map defensively: a blocked or corrupt store gives an empty map and never throws', () => {
    const store = new Map<string, string>()
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) }
    writePositions({ a: 120, b: 40 }, storage)
    expect(readPositions(storage)).toEqual({ a: 120, b: 40 })
    store.set('cc:scroll-positions', '{"a":"x","b":-4,"c":30,"d":null}')
    expect(readPositions(storage)).toEqual({ c: 30 })
    store.set('cc:scroll-positions', 'not json')
    expect(readPositions(storage)).toEqual({})
    store.set('cc:scroll-positions', '[1,2]')
    expect(readPositions(storage)).toEqual({})
    expect(readPositions(null)).toEqual({})
    expect(() => writePositions({ a: 1 }, { setItem: () => { throw new Error('blocked') } })).not.toThrow()
    expect(() => writePositions({ a: 1 }, null)).not.toThrow()
  })

  it('never scrolls past the end of a page that has not finished drawing, and says whether the position is reachable yet', () => {
    expect(restoreTarget(undefined, 5000, 800)).toBeNull()
    expect(restoreTarget(1200, 5000, 800)).toEqual({ y: 1200, reachable: true })
    expect(restoreTarget(1200, 1500, 800)).toEqual({ y: 700, reachable: false })
    expect(restoreTarget(300, 600, 800)).toEqual({ y: 0, reachable: false })
    expect(restoreTarget(0, 600, 800)).toEqual({ y: 0, reachable: true })
  })

  it('decides what a navigation does about the scroll: a fragment first, the same page keeps, Back restores, anything else starts at the top', () => {
    expect(scrollAction({ samePage: false, hash: '#faq', navigation: 'PUSH' })).toBe('hash')
    expect(scrollAction({ samePage: true, hash: '#faq', navigation: 'POP' })).toBe('hash')
    expect(scrollAction({ samePage: true, hash: '', navigation: 'PUSH' })).toBe('keep')
    expect(scrollAction({ samePage: false, hash: '', navigation: 'POP' })).toBe('restore')
    expect(scrollAction({ samePage: false, hash: '', navigation: 'PUSH' })).toBe('top')
    expect(scrollAction({ samePage: false, hash: '', navigation: 'REPLACE' })).toBe('top')
  })
})
