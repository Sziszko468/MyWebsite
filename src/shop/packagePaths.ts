import { PACKAGE_IDS } from '../content/services/ids'
import type { PackageId } from '../content/packages'

/** The folder of the package pages, beneath the shop. */
const BASE = '/services/packages'

/** A package's own page, under the shop: `/services/packages/grow` (language-free; the router adds the language). */
export const packagePath = (id: PackageId): string => `${BASE}/${id}`

/** The package a path segment names (`grow`), or `null`. */
export const packageFromSlug = (slug: string | undefined): PackageId | null => PACKAGE_IDS.find((id) => id === slug) ?? null
