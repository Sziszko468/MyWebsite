import { describe, expect, it } from 'vitest'
import indexHtml from '../../index.html?raw'
import { resolveColor } from '../test/tokens'
import { THEME_STORAGE_KEY, isTheme, resolveTheme } from './theme'

describe('resolveTheme', () => {
  it('uses the stored choice over the system setting', () => {
    expect(resolveTheme('dark', true)).toBe('dark')
    expect(resolveTheme('light', false)).toBe('light')
  })

  it('follows the system when nothing is stored', () => {
    expect(resolveTheme(null, true)).toBe('light')
    expect(resolveTheme(null, false)).toBe('dark')
  })

  it('ignores corrupt stored values', () => {
    expect(resolveTheme('sepia', true)).toBe('light')
    expect(resolveTheme('', false)).toBe('dark')
  })

  it('validates theme names', () => {
    expect(isTheme('dark')).toBe(true)
    expect(isTheme('light')).toBe(true)
    expect(isTheme('system')).toBe(false)
  })
})

describe('pre-paint script in index.html', () => {
  it('reads the same storage key as the app', () => {
    expect(indexHtml).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`)
  })

  it('uses the same system query as the app', () => {
    expect(indexHtml).toContain("(prefers-color-scheme: light)")
  })

  it.each(['dark', 'light'] as const)('pre-stylesheet background for %s equals --color-bg', (theme) => {
    const selector = theme === 'dark' ? 'html {' : `html[data-theme='light'] {`
    const rule = indexHtml.slice(indexHtml.indexOf(selector))
    const hex = rule.match(/background-color:\s*(#[0-9a-f]{6})/i)?.[1].toLowerCase()
    expect(hex).toBe(resolveColor('--color-bg', theme))
  })

  it('keeps theme-color in step with the default (dark) background', () => {
    const hex = indexHtml.match(/name="theme-color" content="(#[0-9a-f]{6})"/i)?.[1].toLowerCase()
    expect(hex).toBe(resolveColor('--color-bg', 'dark'))
  })
})
