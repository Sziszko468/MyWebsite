import type { Language } from '../i18n/config'
import { localizedPath } from '../i18n/paths'

/** The address a page is published at, path only: `/hu/`, `/hu/services/`. Directory style, like the files the build writes. */
export function seoPath(lang: Language, pagePath: string): string {
  const path = localizedPath(lang, pagePath)
  return path.endsWith('/') ? path : `${path}/`
}

/** The picture shared with every link (public/og/default.png, written by scripts/make-og-image.mjs). */
export const DEFAULT_IMAGE_PATH = '/og/default.png'
export const IMAGE_SIZE = { width: 1200, height: 630 } as const
