import { Clock, warn } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { quietKnownLibraryWarnings, resetQuietedWarnings } from './threeConsole'

describe('the known library warnings', () => {
  let spy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetQuietedWarnings()
    spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    resetQuietedWarnings()
    spy.mockRestore()
  })

  it('are printed by three before the filter is installed, so the test means something', () => {
    new Clock()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(String(spy.mock.calls[0][0])).toContain('THREE.Clock')
  })

  it('are dropped once it is installed: the clock react-three-fiber creates is silent', () => {
    quietKnownLibraryWarnings()
    new Clock()
    expect(spy).not.toHaveBeenCalled()
  })

  it('leave every other message from three alone', () => {
    quietKnownLibraryWarnings()
    warn('WebGLRenderer: something real went wrong')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('THREE.WebGLRenderer: something real went wrong')
  })

  it('can be installed more than once without stacking up', () => {
    quietKnownLibraryWarnings()
    quietKnownLibraryWarnings()
    quietKnownLibraryWarnings()
    warn('Object3D: still heard once')
    expect(spy).toHaveBeenCalledTimes(1)
    new Clock()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
