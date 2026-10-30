export * from './approach'
export * from './focus'
export * from './skills'
export * from './story'

/**
 * The tools this very site is built with, read from its own package.json. It is a fact about the
 * site, shown as such ("what this site is built with") on the home page, and not a claim about
 * anything else.
 */
export const siteStack: readonly string[] = [
  'React',
  'TypeScript',
  'Vite',
  'SCSS Modules',
  'Three.js',
  'React Three Fiber',
  'React Router',
]
