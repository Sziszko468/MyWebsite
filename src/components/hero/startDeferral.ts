import { useEffect, useState } from 'react'

/**
 * When the 3D scenes may start loading. The hero's and the intro's field is Three.js, a quarter of a
 * megabyte of code that is parsed and compiled on the main thread. Started the moment the page mounts it
 * competes with the first screen on a phone (measured with the scene's code blocked: the largest paint
 * came about 0.5 s sooner and the blocking time dropped by a third), so it waits until the first screen has
 * settled: the page has loaded and no larger paint has arrived for a moment. The static graphic is what
 * is on screen until then, exactly as it is while the scene loads today. It never waits for long: `maxWaitMs`
 * is a hard limit, and a browser that reports no paint timing simply starts after `settleMs`.
 */

export interface StartEnv {
  readyState: () => DocumentReadyState
  onLoad: (listener: () => void) => () => void
  /** Calls `listener` for every largest-contentful-paint entry (past ones too); `null` when the browser cannot report them. */
  onLargestPaint: ((listener: () => void) => () => void) | null
  setTimeout: (callback: () => void, ms: number) => number
  clearTimeout: (id: number) => void
  /** Runs the callback when the main thread is idle, or soon after `timeout`. */
  idle: (callback: () => void, timeout: number) => () => void
}

export const START_DEFAULTS = { settleMs: 300, maxWaitMs: 3000 } as const

export function browserStartEnv(): StartEnv {
  const supportsPaint =
    typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('largest-contentful-paint')
  return {
    readyState: () => document.readyState,
    onLoad: (listener) => {
      window.addEventListener('load', listener, { once: true })
      return () => window.removeEventListener('load', listener)
    },
    onLargestPaint: supportsPaint
      ? (listener) => {
          const observer = new PerformanceObserver(() => listener())
          observer.observe({ type: 'largest-contentful-paint', buffered: true })
          return () => observer.disconnect()
        }
      : null,
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (id) => window.clearTimeout(id),
    idle: (callback, timeout) => {
      if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(callback, { timeout })
        return () => window.cancelIdleCallback(id)
      }
      const id = window.setTimeout(callback, 0)
      return () => window.clearTimeout(id)
    },
  }
}

/** Calls `start` once the first screen has settled (see above). Returns a function that cancels it. */
export function whenFirstScreenSettled(
  start: () => void,
  { settleMs, maxWaitMs }: { settleMs: number; maxWaitMs: number } = START_DEFAULTS,
  env: StartEnv = browserStartEnv(),
): () => void {
  let finished = false
  let loaded = env.readyState() === 'complete'
  let settleTimer: number | undefined
  let cancelIdle: (() => void) | undefined
  const stops: (() => void)[] = []

  const finish = () => {
    if (finished) return
    finished = true
    cancel()
    start()
  }
  const cancel = () => {
    if (settleTimer !== undefined) env.clearTimeout(settleTimer)
    cancelIdle?.()
    for (const stop of stops) stop()
    stops.length = 0
  }
  // Every new paint of the first screen starts the wait again; the start itself waits for an idle moment.
  const arm = () => {
    if (finished || !loaded) return
    if (settleTimer !== undefined) env.clearTimeout(settleTimer)
    settleTimer = env.setTimeout(() => {
      cancelIdle = env.idle(finish, 1000)
    }, settleMs)
  }

  const limit = env.setTimeout(finish, maxWaitMs)
  stops.push(() => env.clearTimeout(limit))
  if (!loaded) {
    stops.push(
      env.onLoad(() => {
        loaded = true
        arm()
      }),
    )
  }
  if (env.onLargestPaint) stops.push(env.onLargestPaint(arm))
  arm()
  return () => {
    finished = true
    cancel()
  }
}

/** `true` once the 3D scene may start loading (after the first screen has settled), always `false` while `enabled` is. */
export function useStartAfterFirstScreen(enabled = true): boolean {
  const [started, setStarted] = useState(false)
  useEffect(() => {
    if (!enabled || started) return
    return whenFirstScreenSettled(() => setStarted(true))
  }, [enabled, started])
  return started
}
