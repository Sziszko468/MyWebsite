import type { SiteConfig } from './site'

/** A way to reach or follow the owner, ready to render as a link. */
export interface ContactLink {
  id: string
  /** What the link says: "GitHub", or the e-mail address itself. */
  label: string
  /** A mailto: or an https:// address. */
  href: string
  /** Opens another site: it goes in a new tab and says so. An e-mail link does not. */
  external: boolean
}

/**
 * The links the contact page shows, from config/site.ts alone: the e-mail address first, then every
 * profile that has an address. An entry that is still `null` is left out, so no link ever points
 * at an address that was made up or has not been set. Add a profile (a professional community, a
 * personal site) to `social` in site.ts and it appears here and in the footer.
 */
export function contactLinks(config: Pick<SiteConfig, 'contact' | 'social'>): ContactLink[] {
  const links: ContactLink[] = []
  if (config.contact.email) {
    links.push({ id: 'email', label: config.contact.email, href: `mailto:${config.contact.email}`, external: false })
  }
  for (const profile of config.social) {
    if (profile.url) links.push({ id: profile.id, label: profile.label, href: profile.url, external: true })
  }
  return links
}
