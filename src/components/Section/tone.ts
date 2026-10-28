import type { Theme } from '../../theme/theme'

/**
 * Which theme a section wears, relative to the page's:
 *   `base`     the page's own theme
 *   `inverse`  the other one: light on a dark page, dark on a light page
 *   `dark`, `light`  always that theme, whatever the page is
 */
export type SectionTone = 'base' | 'inverse' | 'dark' | 'light'

export function resolveTone(tone: SectionTone, page: Theme): Theme {
  if (tone === 'base') return page
  if (tone === 'inverse') return page === 'dark' ? 'light' : 'dark'
  return tone
}
