import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Reads every stylesheet in src and holds the motion rules to them, so a later edit cannot quietly
 * break them: animate what the compositor can animate, never `all`, and never loop without a
 * reduced-motion answer. The exceptions are few, named, and each says why.
 */

const SRC = fileURLToPath(new URL('../', import.meta.url))

function stylesheets(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return stylesheets(path)
    return /\.(scss|css)$/.test(entry.name) ? [path] : []
  })
}

const sources = stylesheets().map((path) => ({
  file: basename(path),
  css: readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''),
}))

function keyframeProperties(css: string): Array<{ name: string; property: string }> {
  const found: Array<{ name: string; property: string }> = []
  const opening = /@keyframes\s+([\w-]+)\s*\{/g
  let match: RegExpExecArray | null
  while ((match = opening.exec(css))) {
    let depth = 1
    let i = match.index + match[0].length
    const start = i
    while (depth && i < css.length) {
      if (css[i] === '{') depth++
      else if (css[i] === '}') depth--
      i++
    }
    for (const declaration of css.slice(start, i - 1).matchAll(/([a-z-]+)\s*:/g)) found.push({ name: match[1], property: declaration[1] })
  }
  return found
}

function transitionProperties(css: string): string[] {
  const found: string[] = []
  for (const declaration of css.matchAll(/(?:^|[;{\s])transition(?:-property)?\s*:\s*([^;]+);/g)) {
    for (const part of declaration[1].matchAll(/(?:^|,)\s*([a-z][a-z-]*)/g)) if (!/^(var|calc)$/.test(part[1])) found.push(part[1])
  }
  return found
}

const COMPOSITOR = new Set(['opacity', 'transform', 'translate', 'scale', 'rotate', 'clip-path', 'visibility', 'animation-timing-function'])
const PAINT = new Set(['color', 'background-color', 'border-color', 'box-shadow', 'fill', 'stroke', 'filter', 'background-size', 'none'])

/** Animated in a keyframe although not compositor-only. Each is a small decorative stroke or sweep, never layout. */
const KEYFRAME_EXCEPTIONS: Record<string, string[]> = {
  'GenerativeHeroFallback.module.scss': ['stroke-dashoffset'],
  'BuildArt.module.scss': ['stroke-dashoffset'],
  'KineticTypography.module.scss': ['background-position'],
}

/** Transitioned although not compositor or paint. The Lab's own typographic play, and the FAQ's height-free open. */
const TRANSITION_EXCEPTIONS: Record<string, string[]> = {
  'LabSection.module.scss': ['border-radius', 'font-stretch'],
  'Disclosure.module.scss': ['grid-template-rows'],
}

describe('what moves', () => {
  it('animates only transform, opacity, translate, scale, rotate or clip-path in a keyframe, bar the named exceptions', () => {
    const offenders = sources.flatMap(({ file, css }) =>
      keyframeProperties(css)
        .filter(({ property }) => !COMPOSITOR.has(property) && !KEYFRAME_EXCEPTIONS[file]?.includes(property))
        .map(({ name, property }) => `${file}: @keyframes ${name} animates ${property}`),
    )
    expect(offenders).toEqual([])
  })

  it('never transitions layout: no width, height, margin, padding, top, left, right, bottom, gap or inset', () => {
    const layout = /^(width|height|min-|max-|margin|padding|top|left|right|bottom|inset|gap|flex|font-size|line-height|letter-spacing)/
    const offenders = sources.flatMap(({ file, css }) =>
      transitionProperties(css)
        .filter((property) => layout.test(property))
        .map((property) => `${file}: transitions ${property}`),
    )
    expect(offenders).toEqual([])
  })

  it('transitions only compositor or paint properties, bar the named exceptions', () => {
    const offenders = sources.flatMap(({ file, css }) =>
      transitionProperties(css)
        .filter((property) => !COMPOSITOR.has(property) && !PAINT.has(property) && !TRANSITION_EXCEPTIONS[file]?.includes(property))
        .map((property) => `${file}: transitions ${property}`),
    )
    expect(offenders).toEqual([])
  })

  it('never writes `transition: all`: every transition names what it changes', () => {
    const offenders = sources.filter(({ css }) => /transition(?:-property)?\s*:\s*[^;]*\ball\b/.test(css)).map(({ file }) => file)
    expect(offenders).toEqual([])
  })

  it('keeps the exceptions honest: each named exception still exists, so a removed one is removed from the list', () => {
    for (const [file, properties] of Object.entries(KEYFRAME_EXCEPTIONS)) {
      const sheet = sources.find((source) => source.file === file)
      expect(sheet, file).toBeDefined()
      for (const property of properties) expect(keyframeProperties(sheet!.css).map((entry) => entry.property), `${file} ${property}`).toContain(property)
    }
    for (const [file, properties] of Object.entries(TRANSITION_EXCEPTIONS)) {
      const sheet = sources.find((source) => source.file === file)
      expect(sheet, file).toBeDefined()
      for (const property of properties) expect(transitionProperties(sheet!.css), `${file} ${property}`).toContain(property)
    }
  })
})

describe('what loops and what is timed in seconds', () => {
  const animations = (css: string) => [...css.matchAll(/(?:^|[;{\s])animation\s*:\s*([^;]+);/g)].map((match) => match[1].trim())

  it('answers reduced motion in every stylesheet that loops forever or times an animation in literal time', () => {
    const offenders = sources
      .filter(({ css }) => animations(css).some((value) => /infinite/.test(value) || /(^|\s)[\d.]+m?s(\s|$)/.test(value)))
      .filter(({ css }) => !/prefers-reduced-motion/.test(css))
      .map(({ file }) => file)
    expect(offenders).toEqual([])
  })

  /** The bodies of every `@media (prefers-reduced-motion: <mode>)` block, found by matching braces. */
  function mediaBodies(css: string, mode: 'reduce' | 'no-preference'): string[] {
    const bodies: string[] = []
    const opening = new RegExp(String.raw`@media\s*\(\s*prefers-reduced-motion\s*:\s*${mode}\s*\)\s*\{`, 'g')
    let match: RegExpExecArray | null
    while ((match = opening.exec(css))) {
      let depth = 1
      let i = match.index + match[0].length
      const begin = i
      while (depth && i < css.length) {
        if (css[i] === '{') depth++
        else if (css[i] === '}') depth--
        i++
      }
      bodies.push(css.slice(begin, i - 1))
    }
    return bodies
  }

  it('lets nothing loop forever under reduced motion: it only starts when motion is allowed, or a reduced rule switches it off', () => {
    for (const { file, css } of sources) {
      const looping = animations(css).filter((value) => /infinite/.test(value))
      if (!looping.length) continue
      const allowed = mediaBodies(css, 'no-preference').join('\n')
      const reduced = mediaBodies(css, 'reduce').join('\n')
      for (const value of looping) {
        const startsOnlyWhenAllowed = allowed.includes(value)
        const switchedOff = /animation(?:-name)?\s*:\s*none|animation-play-state\s*:\s*paused|display\s*:\s*none/.test(reduced)
        expect(startsOnlyWhenAllowed || switchedOff, `${file}: "${value}" would loop under reduced motion`).toBe(true)
      }
    }
  })

  it('does not time anything in the shop with a delay of its own: the shop is quick and immediate', () => {
    const shop = sources.filter(({ file }) => ['Bands.module.scss', 'Configurator.module.scss', 'ShopHero.module.scss', 'CategoryCard.module.scss', 'Cart.module.scss', 'PathChooser.module.scss'].includes(file))
    expect(shop.length).toBeGreaterThan(0)
    for (const { file, css } of shop) {
      for (const delay of css.matchAll(/(?:animation|transition)-delay\s*:\s*([^;]+);/g)) {
        // A delay is acceptable only as the token-driven stagger of siblings, never a literal wait.
        expect(delay[1], `${file}: ${delay[0]}`).toMatch(/var\(--/)
      }
    }
  })
})

describe('what a scope can change', () => {
  it('sets the scope’s intensity on [data-motion-scope] once, in tokens.css, and nowhere else', () => {
    const outside = sources.filter(({ file, css }) => file !== 'tokens.css' && /--motion-intensity\s*:/.test(css)).map(({ file }) => file)
    expect(outside).toEqual([])
  })

  it('either uses only token durations (which collapse under reduced motion) or answers it, in every stylesheet of the shared engine', () => {
    const literalTime = /(^|[\s,])\d*\.?\d+m?s(?=[\s,;)]|$)/
    for (const file of ['Reveal.module.scss', 'KineticText.module.scss', 'PageTransition.module.scss', 'Loading.module.scss', 'ScrollLinked.module.scss', 'CursorLabel.module.scss', 'RevealImage.module.scss']) {
      const sheet = sources.find((source) => source.file === file)
      expect(sheet, file).toBeDefined()
      const timed = [...sheet!.css.matchAll(/(?:^|[;{\s])(?:transition|animation)\s*:\s*([^;]+);/g)].map((match) => match[1])
      const literal = timed.filter((value) => literalTime.test(value.replace(/var\([^)]*\)/g, '').replace(/calc\([^;]*?\)/g, '')))
      if (literal.length) expect(sheet!.css, `${file} times ${literal[0]} in literal time`).toMatch(/prefers-reduced-motion/)
    }
  })
})
