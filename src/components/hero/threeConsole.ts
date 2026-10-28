import { getConsoleFunction, setConsoleFunction } from 'three'

type Level = 'log' | 'warn' | 'error'
type ConsoleFunction = (type: Level, message: string, ...params: unknown[]) => void

/**
 * Warnings that come from inside a dependency and cannot be acted on here. react-three-fiber
 * (9.x, its latest stable release) still builds its render-loop clock with THREE.Clock, which
 * three deprecated in r183; the clock works and nothing in this project creates one.
 */
const KNOWN_LIBRARY_WARNINGS = ['THREE.Clock: This module has been deprecated']

let installed = false

/**
 * Drops the known library warnings above through three's own console hook and passes every other
 * message to wherever it would have gone, so a real warning from three is still seen. Safe to call
 * more than once.
 */
export function quietKnownLibraryWarnings(): void {
  if (installed) return
  installed = true

  const previous: ConsoleFunction | null = getConsoleFunction()
  setConsoleFunction((type, message, ...params) => {
    if (type === 'warn' && KNOWN_LIBRARY_WARNINGS.some((known) => message.startsWith(known))) return
    if (previous) previous(type, message, ...params)
    else console[type](message, ...params)
  })
}

/** For tests: forgets the installation so each test starts clean. */
export function resetQuietedWarnings(): void {
  installed = false
  setConsoleFunction(null as unknown as ConsoleFunction)
}
