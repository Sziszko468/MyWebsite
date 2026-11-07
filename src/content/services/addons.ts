import type { ServicePrice, VatMode } from '../pricing'
import { overlayAddons } from '../catalogOverlay'
import { tri, type Trilingual } from '../trilingual'
import type { NeedId } from './ids'

/**
 * The optional add-ons a visitor can put on a service. Only what the owner is willing to take on
 * belongs here: an add-on that is listed is an add-on that is offered. The brief also named a CMS
 * integration, but nothing on the portfolio shows or states that work, so it is not offered; a
 * visitor who needs one can say so in the configurator's requirements and it is decided together,
 * once the details are known. To offer it, add an entry here and to the packages that allow it.
 *
 * Every price is `quote`: nothing below is a real figure. An add-on that gets a published price
 * is set like a package's (content/packages.ts); the cart then adds it up on its own.
 */

export const ADDON_IDS = ['pages', 'responsive', 'motion', 'api', 'performance', 'languages', 'custom', 'care'] as const
export type ExtraId = (typeof ADDON_IDS)[number]

export interface Addon {
  id: ExtraId
  name: Trilingual
  summary: Trilingual
  /** The needs it can be added to. A line in the cart can only carry the add-ons that apply to its need. */
  appliesTo: readonly NeedId[]
  price: ServicePrice
  vat: VatMode
  /**
   * `false` when the owner has taken the add-on out of the offer in the administration (it is disabled there): it is not shown,
   * not offered in the cart or the builder, and not listed on a package. Absent means offered.
   */
  available?: boolean
}

const REAL_NEEDS = ['website', 'webapp', 'improve', 'ui', 'integrations'] as const

/** The add-ons as written in this file: what the backend is seeded from (content/catalogExport.ts). */
export const baseAddons: readonly Addon[] = [
  {
    id: 'pages',
    name: tri('További oldalak', 'Additional pages', 'Extra pagina’s'),
    summary: tri(
      'A csomagon felüli oldalak, a megállapodott szerkezetbe illesztve.',
      'Pages beyond the package, fitted into the agreed structure.',
      'Pagina’s bovenop het pakket, ingepast in de afgesproken structuur.',
    ),
    appliesTo: ['website', 'improve'],
    price: { kind: 'quote' },
    vat: 'unspecified',
  },
  {
    id: 'responsive',
    name: tri('Reszponzív átalakítás', 'Responsive adaptation', 'Responsieve aanpassing'),
    summary: tri(
      'Meglévő oldal vagy felület átalakítása, hogy mobiltól asztali gépig jól használható legyen.',
      'Reworking an existing page or interface so it works well from phone to desktop.',
      'Een bestaande pagina of interface aanpassen zodat die van telefoon tot desktop goed werkt.',
    ),
    appliesTo: ['improve', 'ui'],
    price: { kind: 'quote' },
    vat: 'unspecified',
  },
  {
    id: 'motion',
    name: tri('Animáció és interakciók', 'Animation and interactions', 'Animatie en interactie'),
    summary: tri(
      'Visszafogott, célzott mozgás és interaktív részletek; a használhatóság mindig előbbre való.',
      'Restrained, purposeful motion and interactive details; usability always comes first.',
      'Ingetogen, doelgerichte beweging en interactieve details; bruikbaarheid gaat altijd voor.',
    ),
    appliesTo: ['website', 'webapp', 'improve', 'ui'],
    price: { kind: 'quote' },
    vat: 'unspecified',
  },
  {
    id: 'api',
    name: tri('API-integráció', 'API integration', 'API-integratie'),
    summary: tri(
      'Egy külső szolgáltatás vagy API bekötése; hogy megvalósítható-e, azt az ajánlat előtt tisztázzuk.',
      'Connecting an external service or API; whether it can be done is settled before the quote.',
      'Een externe dienst of API koppelen; of dat kan, stemmen we af vóór de offerte.',
    ),
    appliesTo: ['website', 'webapp', 'improve', 'integrations'],
    price: { kind: 'quote' },
    vat: 'unspecified',
  },
  {
    id: 'performance',
    name: tri('Teljesítmény-optimalizálás', 'Performance optimization', 'Prestatie-optimalisatie'),
    summary: tri(
      'Egy meglévő oldal vagy alkalmazás sebességének átvilágítása, és a talált szűk keresztmetszetek javítása.',
      'Reviewing how fast an existing site or application is, and fixing the bottlenecks found.',
      'Nagaan hoe snel een bestaande site of applicatie is en de gevonden knelpunten verhelpen.',
    ),
    appliesTo: ['website', 'webapp', 'improve', 'ui'],
    price: { kind: 'quote' },
    vat: 'unspecified',
  },
  {
    id: 'languages',
    name: tri('További nyelv', 'Additional language', 'Extra taal'),
    summary: tri(
      'Egy újabb nyelvi változat a meglévő szerkezetben; a szövegek elkészítésének módját az ajánlatban rögzítjük.',
      'An extra language version in the existing structure; how the texts are produced is agreed in the quote.',
      'Een extra taalversie in de bestaande structuur; hoe de teksten tot stand komen, leggen we vast in de offerte.',
    ),
    appliesTo: ['website', 'webapp', 'improve', 'ui'],
    price: { kind: 'quote' },
    vat: 'unspecified',
  },
  {
    id: 'custom',
    name: tri('Egyedi funkció', 'Custom functionality', 'Maatwerkfunctionaliteit'),
    summary: tri(
      'Valami, ami nincs a listán: leírod, és a részletek ismeretében közösen döntjük el, belefér-e.',
      'Something that is not on the list: you describe it and, once the details are known, we decide together whether it fits.',
      'Iets dat niet op de lijst staat: jij beschrijft het en als de details bekend zijn, beslissen we samen of het past.',
    ),
    appliesTo: [...REAL_NEEDS, 'unsure'],
    price: { kind: 'quote' },
    vat: 'unspecified',
  },
  {
    id: 'care',
    name: tri('Karbantartás', 'Maintenance', 'Onderhoud'),
    summary: tri(
      'Folyamatos karbantartás külön megállapodás szerint (lásd a Care csomagot).',
      'Ongoing maintenance by separate agreement (see the Care package).',
      'Doorlopend onderhoud volgens aparte afspraak (zie het pakket Care).',
    ),
    appliesTo: ['website', 'webapp', 'improve', 'integrations'],
    price: { kind: 'quote' },
    vat: 'unspecified',
  },
]

/** What the website shows: the add-ons above with the prices and texts edited in the administration laid over them (content/catalogOverlay.ts). */
/** A copy of its own: the live catalogue updates this list in place and must never touch the source's `base…` list. */
export const addons: readonly Addon[] = [...overlayAddons(baseAddons)]

export function getAddon(id: ExtraId): Addon {
  const found = addons.find((addon) => addon.id === id)
  if (!found) throw new Error(`Unknown add-on: ${id}`)
  return found
}

export const isExtraId = (value: unknown): value is ExtraId => ADDON_IDS.some((id) => id === value)

/** The add-ons that can be put on a need, in catalogue order. */
export function addonsFor(need: NeedId): readonly Addon[] {
  return addons.filter((addon) => addon.available !== false && addon.appliesTo.includes(need))
}

/** The add-ons a package can carry that are on offer now, in catalogue order. */
export function offeredExtras(extras: readonly ExtraId[]): readonly Addon[] {
  return addons.filter((addon) => addon.available !== false && extras.includes(addon.id))
}
