import { SERVICE_IDS, serviceOfNeed, type NeedId, type ServiceId } from '../content/services/ids'

/** Where the shop's pages live (language-free, like routes/pages.ts); one place, so a move is one edit. */
export const SHOP_PATHS = {
  home: '/services',
  configure: '/services/configure',
  cart: '/services/cart',
  fullExperience: '/services/full-experience',
  fullExperienceStart: '/services/full-experience/start',
} as const

export const servicePath = (id: ServiceId): string => `/services/${id}`

/** The page that explains a need: its service's, or the shop's front page for "not sure yet". */
export function pathOfNeed(need: NeedId): string {
  const service = serviceOfNeed(need)
  return service ? servicePath(service) : SHOP_PATHS.home
}

/** The service a path names (`website`), or `null`. */
export function serviceFromSlug(slug: string | undefined): ServiceId | null {
  return SERVICE_IDS.find((id) => id === slug) ?? null
}

/** Whether a language-free path belongs to the shop: the services page and everything beneath it. */
export function isShopPath(path: string): boolean {
  const clean = path.replace(/\/+$/, '')
  return clean === SHOP_PATHS.home || clean.startsWith(`${SHOP_PATHS.home}/`)
}
