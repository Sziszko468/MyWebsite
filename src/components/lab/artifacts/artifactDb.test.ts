import { describe, expect, it } from 'vitest'
import { LIMITS, cleanName, createMemoryBackend, createService, parseArtifact, type Backend } from './artifactDb'

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=='

describe('the artifact record', () => {
  it('accepts a good one and cleans the name', () => {
    const artifact = parseArtifact({
      id: 'a1',
      type: 'track',
      name: '<b>My "track"</b>',
      createdAt: 5,
      updatedAt: 6,
      payload: { x: 1 },
      thumbnail: PNG,
    })
    expect(artifact).not.toBeNull()
    expect(artifact!.name).toBe('bMy track/b')
    expect(artifact!.thumbnail).toBe(PNG)
    expect(cleanName('  ', 'Fallback')).toBe('Fallback')
    expect(cleanName('x'.repeat(200), 'f').length).toBe(LIMITS.name)
  })

  it('refuses what is not one, and drops a preview that is not a small PNG', () => {
    expect(parseArtifact(null)).toBeNull()
    expect(parseArtifact({ id: '../x', type: 'track', payload: {} })).toBeNull()
    expect(parseArtifact({ id: 'a', type: 'virus', payload: {} })).toBeNull()
    expect(parseArtifact({ id: 'a', type: 'track', payload: [1] })).toBeNull()
    expect(parseArtifact({ id: 'a', type: 'track', payload: { big: 'x'.repeat(LIMITS.payload) } })).toBeNull()
    expect(
      parseArtifact({ id: 'a', type: 'track', payload: {}, thumbnail: 'javascript:alert(1)' })!.thumbnail,
    ).toBeUndefined()
    expect(
      parseArtifact({ id: 'a', type: 'track', payload: {}, thumbnail: PNG + 'A'.repeat(LIMITS.thumbnail) })!.thumbnail,
    ).toBeUndefined()
    expect(
      parseArtifact({ id: 'a', type: 'track', payload: {}, thumbnail: 'data:text/html;base64,AAAA' })!.thumbnail,
    ).toBeUndefined()
  })
})

describe('the service', () => {
  const make = (backend: Backend = createMemoryBackend()) => {
    let clock = 1000
    return createService(backend, () => (clock += 10))
  }

  it('saves, lists the newest first, renames and deletes', async () => {
    const service = make()
    const a = await service.save({ type: 'track', name: 'First', payload: { n: 1 } })
    const b = await service.save({ type: 'setup', name: 'Second', payload: { n: 2 }, thumbnail: PNG })
    expect(a.ok && b.ok).toBe(true)
    expect((await service.list()).map((item) => item.name)).toEqual(['Second', 'First'])
    if (!a.ok) return
    expect(await service.rename(a.artifact.id, 'Renamed')).toBe(true)
    expect((await service.list())[0].name).toBe('Renamed')
    expect(await service.rename('missing', 'x')).toBe(false)
    expect(await service.remove(a.artifact.id)).toBe(true)
    expect(await service.list()).toHaveLength(1)
  })

  it('saving again with the same id replaces the work and keeps when it was made', async () => {
    const service = make()
    const first = await service.save({ type: 'model', name: 'Model', payload: { v: 1 } })
    if (!first.ok) throw new Error('save failed')
    const again = await service.save({ id: first.artifact.id, type: 'model', name: 'Model', payload: { v: 2 } })
    expect(again.ok).toBe(true)
    const list = await service.list()
    expect(list).toHaveLength(1)
    expect(list[0].payload).toEqual({ v: 2 })
    expect(list[0].createdAt).toBe(first.artifact.createdAt)
  })

  it('says why it could not save: too large, full, invalid, no room', async () => {
    const service = make()
    expect(
      await service.save({ type: 'track', name: 'Big', payload: { big: 'x'.repeat(LIMITS.payload + 10) } }),
    ).toEqual({ ok: false, reason: 'too-large' })
    expect(await service.save({ type: 'virus' as never, name: 'Bad', payload: {} })).toEqual({
      ok: false,
      reason: 'invalid',
    })
    for (let i = 0; i < LIMITS.artifacts; i++) await service.save({ type: 'setup', name: `s${i}`, payload: { i } })
    expect(await service.save({ type: 'setup', name: 'one too many', payload: {} })).toEqual({
      ok: false,
      reason: 'full',
    })

    const noRoom: Backend = {
      persistent: true,
      all: async () => [],
      put: async () => {
        throw new DOMException('no room', 'QuotaExceededError')
      },
      remove: async () => {},
    }
    expect(await make(noRoom).save({ type: 'track', name: 'x', payload: {} })).toEqual({ ok: false, reason: 'quota' })
    const broken: Backend = {
      ...noRoom,
      put: async () => {
        throw new Error('closed')
      },
    }
    expect(await make(broken).save({ type: 'track', name: 'x', payload: {} })).toEqual({ ok: false, reason: 'blocked' })
  })

  it('ignores anything in the store that is not a valid work, and reports whether it lasts', async () => {
    const backend: Backend = {
      persistent: true,
      all: async () => [{ id: 'ok', type: 'track', name: 'Fine', payload: {} }, { id: 5 }, null, 'x'],
      put: async () => {},
      remove: async () => {},
    }
    const service = make(backend)
    expect((await service.list()).map((item) => item.id)).toEqual(['ok'])
    expect(service.persistent).toBe(true)
    expect(make().persistent).toBe(false)
  })
})
