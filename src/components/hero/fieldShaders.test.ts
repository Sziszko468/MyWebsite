import { describe, expect, it } from 'vitest'
import * as shaders from './fieldShaders'
import { CURSOR, FIELD } from './velocityHeroConfig'

// The shaders are template strings with the engine's numbers substituted in. They only compile on
// a real GPU, but the mistakes that are cheap to make (an unsubstituted number, a stray bracket)
// can be caught here.
const sources = Object.entries(shaders).filter((entry): entry is [string, string] => typeof entry[1] === 'string')

describe('shader sources', () => {
  it('exports a vertex and a fragment shader for every system', () => {
    const names = sources.map(([name]) => name)
    for (const system of ['STREAK', 'TRAIL', 'GRID', 'RING', 'DUST', 'BEAM', 'HUD']) {
      expect(names, system).toContain(`${system}_VERT`)
      expect(names, system).toContain(`${system}_FRAG`)
    }
  })

  it.each(sources)('%s has all its template values substituted', (_name, source) => {
    expect(source).not.toContain('${')
    expect(source).not.toMatch(/undefined|NaN|Infinity/)
  })

  it.each(sources)('%s has balanced braces, parentheses and brackets', (_name, source) => {
    const count = (character: string) => source.split(character).length - 1
    expect(count('{')).toBe(count('}'))
    expect(count('(')).toBe(count(')'))
    expect(count('[')).toBe(count(']'))
  })

  it.each(sources.filter(([name]) => name.endsWith('_FRAG')))('%s writes the output colour', (_name, source) => {
    expect(source).toContain('gl_FragColor')
  })

  it.each(sources.filter(([name]) => name.endsWith('_VERT')))('%s writes the position', (_name, source) => {
    expect(source).toContain('gl_Position')
  })
})

describe('the shared forces', () => {
  const forced = [shaders.STREAK_VERT, shaders.RING_VERT, shaders.GRID_VERT, shaders.DUST_VERT, shaders.TRAIL_VERT]

  it("use the engine's ripple count and lifetime", () => {
    for (const source of forced) {
      expect(source).toContain(`uRipples[${CURSOR.maxRipples}]`)
      expect(source).toContain(FIELD.rippleSeconds.toFixed(2))
    }
  })

  it('are drawn by the overlay on the same front the force pushes: age times 1.25', () => {
    expect(shaders.HUD_FRAG).toContain('age * 1.25')
    expect(shaders.STREAK_VERT).toContain('age * 1.25')
  })
})

describe('the overlay', () => {
  it('reads everything it draws from', () => {
    for (const uniform of ['uCursor', 'uCursorVel', 'uPresence', 'uEnergy', 'uRipples', 'uExit', 'uOrigin', 'uPixel', 'uAspect']) {
      expect(shaders.HUD_FRAG, uniform).toContain(uniform)
    }
  })

  it('fades its exit to nothing at both ends, so it cannot flash', () => {
    expect(shaders.HUD_FRAG).toContain('sin(3.14159265 * clamp(uExit, 0.0, 1.0))')
  })
})
