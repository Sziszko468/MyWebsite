import { describe, expect, it } from 'vitest'
import * as shaders from './fieldShaders'

// One NaN pixel in the half-float target is spread over the whole frame by the bloom, and the
// frame goes black: a flicker. The operations that produce NaN are undefined in GLSL rather than
// merely inaccurate, so the shaders are held to a few rules that can be checked in the source.

/** The code only: a comment may say "pow()" or "NaN" without calling or producing either. */
const code = (source: string) => source.replace(/\/\/.*$/gm, '')

const sources = Object.entries(shaders)
  .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  .map(([name, source]): [string, string] => [name, code(source)])

/** The first argument of every call to `name(`, with nested parentheses balanced. */
function firstArguments(source: string, name: string): string[] {
  const found: string[] = []
  let from = 0
  for (;;) {
    const at = source.indexOf(`${name}(`, from)
    if (at < 0) break
    let depth = 0
    let end = at + name.length
    for (let i = end; i < source.length; i++) {
      if (source[i] === '(') depth++
      if (source[i] === ')') depth--
      if ((source[i] === ',' && depth === 1) || depth === 0) {
        end = i
        break
      }
    }
    found.push(source.slice(at + name.length + 1, end).trim())
    from = at + name.length + 1
  }
  return found
}

// Bases that are provably not negative: clamped, absolute, a positive uniform, or the fractional
// part's complement (fract is in [0, 1)).
const NON_NEGATIVE = [/^max\(/, /^abs\(/, /^uSpread$/, /^1\.0 - f$/]

describe('pow()', () => {
  it.each(sources)('%s only raises a base that cannot be negative', (_name, source) => {
    for (const base of firstArguments(source, 'pow')) {
      expect(NON_NEGATIVE.some((rule) => rule.test(base)), `pow(${base}, …)`).toBe(true)
    }
  })

  it('is covered: the helper finds the calls', () => {
    expect(firstArguments(code(shaders.STREAK_FRAG), 'pow')).toEqual(['max(vAlong, 0.0)'])
    expect(firstArguments('pow(max(a, 0.0), 2.0) + pow(b, 3.0)', 'pow')).toEqual(['max(a, 0.0)', 'b'])
  })
})

describe('smoothstep()', () => {
  it.each(sources)('%s never passes the edges in reverse, which the specification leaves undefined', (_name, source) => {
    for (const match of source.matchAll(/smoothstep\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,/g)) {
      expect(Number(match[1]), `smoothstep(${match[1]}, ${match[2]}, …)`).toBeLessThan(Number(match[2]))
    }
  })
})

describe('atan()', () => {
  it.each(sources)('%s calls the two-argument atan only through the guarded helper', (_name, source) => {
    const calls = source.match(/atan\(/g) ?? []
    // The helper itself is the one place that calls it, and it guards the zero vector first.
    expect(calls.length).toBeLessThanOrEqual(1)
    if (calls.length === 1) expect(source).toContain('abs(v.x) + abs(v.y) < 1e-7')
  })
})

describe('division', () => {
  it.each(sources)('%s divides only by guarded or constant denominators in the overlay maths', (_name, source) => {
    // Colour is normalised by the accumulated alpha: that denominator must be floored.
    if (source.includes('acc / ')) expect(source).toContain('acc / max(alpha, 1e-4)')
  })
})
