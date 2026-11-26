import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageSwitcher } from '../components/LanguageSwitcher/LanguageSwitcher'
import { MainNav } from '../components/MainNav/MainNav'
import { I18nContext } from '../i18n/context'
import { dictionaries } from '../i18n/dictionaries'
import { rawToken } from '../test/tokens'
import { MOTION } from './config'
import { coverPage, pageCovered, subscribeCover } from './cover'
import { indicatorBox, placeIndicator } from './indicator'
import { arrivalOf, followsHere, pageKeyOf } from './navigation'
import { PageTransition } from './PageTransition'
import { prefersReducedMotion, subscribeReducedMotion, REDUCED_MOTION } from './reducedMotion'
import { exitProgress } from './scroll'
import { documentArrival, entryKeyOf, scrollAction } from './scrollRestoration'

/**
 * PROMPT 38: the shared pieces the motion system gained, and the rules the pages now keep. What only a browser can show (frames, computed styles, a real navigation) is
 * in tools/e2e/motion-journey.cjs.
 */

const SRC = fileURLToPath(new URL('../', import.meta.url))
const read = (path: string) => readFileSync(join(SRC, path), 'utf8')
const bare = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')

afterEach(() => vi.unstubAllGlobals())

describe('the interaction tokens', () => {
  it('are the same in the stylesheet and in the config, and a press is nothing under reduced motion', () => {
    expect(Number.parseFloat(rawToken('--motion-lift') ?? '')).toBe(MOTION.interaction.lift)
    expect(Number(rawToken('--motion-press'))).toBe(MOTION.interaction.press)
    const css = read('styles/tokens.css')
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css.replace(/\r\n/g, '\n'))![1]
    expect(reduced).toMatch(/--motion-press:\s*1;/)
    expect(MOTION.reduced.press).toBe(1)
    expect(MOTION.interaction.press).toBeGreaterThan(0.95)
    expect(MOTION.interaction.lift).toBeLessThanOrEqual(MOTION.distance.sm)
  })

  it('are what the shared mixins use: the lift is scaled by the page’s intensity, the press is a scale', () => {
    const mixins = bare(read('styles/_mixins.scss'))
    expect(mixins).toMatch(/@mixin lift \{[\s\S]*?translate: 0 calc\(var\(--motion-lift\) \* var\(--motion-intensity\) \* -1\);/)
    expect(mixins).toMatch(/@mixin press \{[\s\S]*?scale: var\(--motion-press\);/)
    expect(mixins).toMatch(/@mixin press-card \{[\s\S]*?scale: calc\(1 - \(1 - var\(--motion-press\)\) \* 0\.5\);/)
  })

  const stylesheets = (directory = SRC): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return stylesheets(path)
      return /\.(scss|css)$/.test(entry.name) ? [path] : []
    })

  it('replaced the literal press scales of the shared controls: none of them presses by a number of its own any more', () => {
    for (const file of ['Button.module.scss', 'ProjectCard.module.scss', 'CategoryCard.module.scss', 'Choice.module.scss', 'Gallery.module.scss', 'LabControls.module.scss', 'LanguageSwitcher.module.scss']) {
      const path = stylesheets().find((candidate) => basename(candidate) === file)!
      expect(path, file).toBeDefined()
      expect(bare(readFileSync(path, 'utf8')), file).not.toMatch(/:active[^{]*\{[^}]*scale\(0\.\d+\)|scale\(0\.9[0-9]+\)/)
    }
  })

  it('gives every card that rises under a mouse the same under the keyboard', () => {
    for (const path of ['components/ProjectCard/ProjectCard.module.scss', 'components/shop/CategoryCard.module.scss', 'components/project/Gallery.module.scss', 'archive/CommandCenter.module.scss']) {
      const css = bare(read(path))
      expect(css, path).toMatch(/focus-visible[^{]*\{[^}]*(translate|transform|box-shadow|border-color)/)
    }
  })
})

describe('reduced motion, followed while the page is open', () => {
  function media(initial: boolean) {
    let matches = initial
    const listeners = new Set<() => void>()
    vi.stubGlobal('window', {
      matchMedia: (query: string) => ({
        get matches() {
          return query === REDUCED_MOTION && matches
        },
        addEventListener: (_: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
      }),
    })
    return {
      set: (value: boolean) => {
        matches = value
        for (const listener of listeners) listener()
      },
      count: () => listeners.size,
    }
  }

  it('reads the setting, hears a change, and stops listening', () => {
    const setting = media(false)
    expect(prefersReducedMotion()).toBe(false)
    const heard = vi.fn()
    const stop = subscribeReducedMotion(heard)
    setting.set(true)
    expect(heard).toHaveBeenCalledTimes(1)
    expect(prefersReducedMotion()).toBe(true)
    stop()
    expect(setting.count()).toBe(0)
  })

  it('is false where there is no window to ask', () => {
    expect(prefersReducedMotion()).toBe(false)
    expect(() => subscribeReducedMotion(() => undefined)()).not.toThrow()
  })

  it('is what every script that moves something follows, so a change mid-visit stops it', () => {
    for (const path of ['components/motion/CursorLabel.tsx', 'motion/useMagnetic.ts', 'motion/scroll.ts', 'components/lab/page/useCanvasLoop.ts']) {
      const code = bare(read(path))
      expect(code, path).toContain('useReducedMotion()')
      expect(code, path).toMatch(/\[[^\]]*reduced[^\]]*\]/)
      expect(code, path).not.toContain("matchMedia('(prefers-reduced-motion: reduce)')")
    }
  })
})

describe('what covers the page', () => {
  it('counts every cover, releases each once, and tells who listens', () => {
    expect(pageCovered()).toBe(false)
    const heard = vi.fn()
    const stop = subscribeCover(heard)
    const menu = coverPage()
    const assistant = coverPage()
    expect(pageCovered()).toBe(true)
    menu()
    menu()
    expect(pageCovered()).toBe(true)
    assistant()
    expect(pageCovered()).toBe(false)
    expect(heard).toHaveBeenCalledTimes(4)
    stop()
    coverPage()()
    expect(heard).toHaveBeenCalledTimes(4)
  })

  it('is said by the phone menu and the phone assistant, and heard by every live scene', () => {
    expect(read('components/MobileMenu/MobileMenu.tsx')).toContain('useEffect(() => (open ? coverPage() : undefined), [open])')
    expect(read('components/ai/AssistantPanel.tsx')).toContain('useEffect(() => (phone ? coverPage() : undefined), [phone])')
    expect(read('components/hero/useHeroDriver.ts')).toContain('inView && tabVisible && !covered')
    expect(read('components/lab/core/LabStage.tsx')).toContain('active={inView && tabVisible && !covered}')
    const loop = read('components/lab/page/useCanvasLoop.ts')
    expect(loop).toContain('pageCovered()')
    expect(loop).toContain('uncovered()')
  })
})

describe('the sliding marker', () => {
  it('measures an item inside its row in whole pixels, and nothing for an item with no size', () => {
    expect(indicatorBox({ left: 10, top: 20, width: 300, height: 40 }, { left: 62.4, top: 25.6, width: 48.7, height: 30.2 })).toEqual({ x: 52, y: 6, width: 49, height: 30 })
    expect(indicatorBox({ left: 0, top: 0, width: 300, height: 40 }, { left: 5, top: 5, width: 0, height: 30 })).toBeNull()
  })

  it('writes the box on the row and says whether the marker is placed', () => {
    const written: Record<string, string> = {}
    const row = { dataset: {} as Record<string, string>, style: { setProperty: (name: string, value: string) => (written[name] = value) }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 40 }) }
    placeIndicator(row as unknown as HTMLElement, { getBoundingClientRect: () => ({ left: 20, top: 4, width: 60, height: 32 }) } as Element)
    expect(written).toEqual({ '--ind-x': '20px', '--ind-y': '4px', '--ind-w': '60', '--ind-h': '32' })
    expect(row.dataset.indicator).toBe('on')
    placeIndicator(row as unknown as HTMLElement, null)
    expect(row.dataset.indicator).toBe('none')
  })

  const frame = (child: ReturnType<typeof createElement>) =>
    renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: ['/en/about'] }, createElement(I18nContext.Provider, { value: { lang: 'en', t: dictionaries.en } }, child)))

  it('is decoration in the language switcher: the current language is marked by the link itself, before any script', () => {
    const html = frame(createElement(LanguageSwitcher))
    expect(html).toMatch(/<span class="[^"]*" aria-hidden="true"><\/span>/)
    expect(html).toMatch(/aria-current="true"[^>]*>EN/)
    expect(html).not.toContain('data-indicator')
    expect(bare(read('components/LanguageSwitcher/LanguageSwitcher.module.scss'))).toMatch(/forced-colors: active[\s\S]*Highlight/)
  })

  it('leaves the header’s current page marked by aria-current, with nothing pending before a click', () => {
    const html = frame(createElement(MainNav, { variant: 'bar' }))
    expect(html).toMatch(/aria-current="page"[^>]*href="\/en\/about"|href="\/en\/about"[^>]*aria-current="page"/)
    expect(html).not.toContain('data-pending')
  })
})

describe('the navigation', () => {
  it('treats an address with and without its final slash as one page', () => {
    for (const [rest, page] of [['/', '/'], ['', '/'], ['/about', '/about'], ['/about/', '/about'], ['/work/spendly//', '/work/spendly'], ['//', '/']] as const) expect(pageKeyOf(rest), rest).toBe(page)
    expect(read('routes/LanguageLayout.tsx')).toContain('pageKeyOf(splitLanguage(pathname).rest)')
  })

  it('arrives without an animation only on the page a visit starts on, and quietly on Back and Forward', () => {
    expect(arrivalOf('POP', 'default')).toEqual({ startPage: true, returning: true })
    expect(arrivalOf('POP', 'a1b2')).toEqual({ startPage: false, returning: true })
    expect(arrivalOf('PUSH', 'default')).toEqual({ startPage: false, returning: false })
    expect(arrivalOf('REPLACE', 'c3')).toEqual({ startPage: false, returning: false })
  })

  it('decides the arrival once, when the page arrives, so a later change of its address replays nothing', () => {
    expect(bare(read('motion/PageTransition.tsx'))).toContain('useState(() => arrivalOf(navigation, key))')
    const transitionProps = { routeKey: '/about', scope: 'portfolio' as const, children: createElement('p', null, 'x') }
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(PageTransition, transitionProps)))
    expect(html).toContain('data-enter="none"')
  })

  it('moves the marker only for a click the router follows in this tab', () => {
    const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }
    expect(followsHere(click)).toBe(true)
    for (const patch of [{ button: 1 }, { button: 2 }, { metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { defaultPrevented: true }]) expect(followsHere({ ...click, ...patch }), JSON.stringify(patch)).toBe(false)
  })

  it('lets the page being left recede only while a page’s code is really being waited for, and never blocks it', () => {
    const css = bare(read('styles/motion.css'))
    expect(css).toMatch(/html\[data-route-loading\] main > :first-child \{[^}]*opacity: 0\.\d+;[^}]*\}/)
    expect(css).not.toMatch(/data-route-loading[^{]*\{[^}]*pointer-events/)
    const bar = bare(read('components/motion/Loading.tsx'))
    expect(bar).toContain("root.dataset.routeLoading = ''")
    expect(bar).toContain('delete root.dataset.routeLoading')
  })

  it('arrives in order on a navigation only, and never under reduced motion', () => {
    const css = bare(read('components/PageHero/PageHero.module.scss'))
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*:global\(\[data-nav='push'\]:not\(\[data-enter='none'\]\)\)/)
  })
})

describe('where a page opens', () => {
  it('gives each page opened by its address its own entry, so one page’s position never lands on another', () => {
    expect(entryKeyOf('default', '/en/about/')).toBe(entryKeyOf('default', '/en/about'))
    expect(entryKeyOf('default', '/en/about/')).not.toBe(entryKeyOf('default', '/en/services/'))
    expect(entryKeyOf('k3j9', '/en/about')).toBe('k3j9')
  })

  it('reads how the document was reached, and takes an unknown answer for a fresh visit', () => {
    const timing = (type: string | undefined) => ({ getEntriesByType: () => (type === undefined ? [] : [{ type } as unknown as PerformanceEntry]) })
    expect(documentArrival(timing('reload'))).toBe('reload')
    expect(documentArrival(timing('back_forward'))).toBe('back_forward')
    expect(documentArrival(timing(undefined))).toBe('navigate')
    expect(documentArrival(undefined)).toBe('navigate')
  })

  it('starts a freshly opened page at the top, restores a return or a reload, and keeps a fragment’s element', () => {
    expect(scrollAction({ samePage: false, hash: '', navigation: 'POP', fresh: true })).toBe('top')
    expect(scrollAction({ samePage: false, hash: '', navigation: 'POP', fresh: false })).toBe('restore')
    expect(scrollAction({ samePage: false, hash: '#x', navigation: 'POP', fresh: true })).toBe('hash')
    expect(scrollAction({ samePage: true, hash: '', navigation: 'POP' })).toBe('keep')
  })

  it('waits for a page to be tall enough before it restores, instead of showing it half way', () => {
    const code = bare(read('motion/ScrollManager.tsx'))
    expect(code).toContain("documentArrival() === 'navigate'")
    expect(code).toContain('target.reachable || attempts >= RESTORE_FRAMES')
  })
})

describe('depth that starts at rest', () => {
  it('is zero until the element leaves through the top, and never more than one', () => {
    expect(exitProgress(0, 600)).toBe(0)
    expect(exitProgress(120, 600)).toBe(0)
    expect(exitProgress(-150, 600)).toBe(0.25)
    expect(exitProgress(-600, 600)).toBe(1)
    expect(exitProgress(-900, 600)).toBe(1)
    expect(exitProgress(-10, 0)).toBe(0)
  })

  it('moves the first screen’s layers by transform only, scaled by the page’s intensity and parallax', () => {
    const css = bare(read('components/PageHero/PageHero.module.scss'))
    const moves = [...css.matchAll(/translate: 0 calc\(var\(--sp-exit, 0\) \* \d+px \* var\(--motion-parallax\) \* var\(--motion-intensity\)\);/g)]
    expect(moves).toHaveLength(2)
  })
})

describe('no second animation system', () => {
  it('adds no animation library: the dependencies that move things are React, Three.js and its React renderer', () => {
    const dependencies = Object.keys((JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8')) as { dependencies: Record<string, string> }).dependencies)
    expect(dependencies.filter((name) => /gsap|framer|motion|anime|lottie|popmotion|spring|velocity/i.test(name))).toEqual([])
  })

  it('keeps exactly six experiences in the Lab', async () => {
    const { experiments } = await import('../content/lab')
    expect(experiments).toHaveLength(6)
  })
})
