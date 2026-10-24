export interface SocialProfile {
  id: string
  /** Proper noun, shown as is in every language. */
  label: string
  /** Full https:// address. `null` until the real profile exists. */
  url: string | null
}

export interface LegalLink {
  id: 'privacy' | 'legalNotice'
  /** Language-free path of a real page, e.g. '/privacy'. `null` until the page exists. */
  path: string | null
}

export interface SiteConfig {
  brandName: string
  /** Up to three characters for the header mark; derived from the brand name when `null`. */
  monogram: string | null
  contact: {
    /** Shown and linked in the footer once set. */
    email: string | null
  }
  social: SocialProfile[]
  legal: LegalLink[]
}

// Every `null` below is a placeholder on purpose. Unset entries never render as links:
// they stay hidden in production and show as muted labels in development.
export const siteConfig: SiteConfig = {
  brandName: 'Your Name',
  monogram: null,
  contact: {
    email: null,
  },
  social: [
    { id: 'github', label: 'GitHub', url: null },
    { id: 'linkedin', label: 'LinkedIn', url: null },
  ],
  legal: [
    { id: 'privacy', path: null },
    { id: 'legalNotice', path: null },
  ],
}

export function getMonogram(config: Pick<SiteConfig, 'brandName' | 'monogram'> = siteConfig): string {
  if (config.monogram) return config.monogram.slice(0, 3).toUpperCase()
  const initials = config.brandName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
  return initials.toUpperCase() || '·'
}
