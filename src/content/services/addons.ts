import type { ServicePrice, VatMode } from '../pricing'
import { overlayAddons } from '../catalogOverlay'
import { tri, type Trilingual } from '../trilingual'
import type { NeedId } from './ids'

/**
 * The optional add-ons a visitor can put on a service. Only what the owner is willing to take on
 * belongs here: an add-on that is listed is an add-on that is offered. The brief also named a CMS
 * integration, but nothing on the portfolio shows or states that work, so it is not offered; a
 * visitor who needs one can say so in the request builder's requirements and it is decided together,
 * once the details are known. To offer it, add an entry here and to the packages that allow it.
 *
 * Every price is `quote`: nothing below is a real figure. An add-on that gets a published price
 * is set like a package's (content/packages.ts); the cart then adds it up on its own.
 *
 * The one word for these in each language: "add-on" (English), "kiegészítő" (Hungarian), "extra" (Dutch).
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
      'A csomagban lévőnél több oldal, a megegyezett szerkezetbe illesztve.',
      'More pages than the package includes, added to the agreed structure.',
      'Meer pagina’s dan in het pakket zitten, ingepast in de afgesproken structuur.',
    ),
    appliesTo: ['website', 'improve'],
    price: { kind: 'quote' },
    vat: 'unspecified',
  },
  {
    id: 'responsive',
    name: tri('Minden képernyőre igazítás', 'Make it work on every screen', 'Geschikt maken voor alle schermen'),
    summary: tri(
      'Egy meglévő oldal átalakítása, hogy telefonon, tableten és számítógépen is jól használható legyen.',
      'Reworking an existing page so it works well on phones, tablets and computers.',
      'Een bestaande pagina aanpassen zodat die goed werkt op telefoon, tablet en computer.',
    ),
    appliesTo: ['improve', 'ui'],
    price: { kind: 'quote' },
    vat: 'unspecified',
  },
  {
    id: 'motion',
    name: tri('Animáció és interaktív részletek', 'Animation and interactive details', 'Animatie en interactieve details'),
    summary: tri(
      'Visszafogott, célzott mozgás és interaktív részletek. A könnyű használat mindig előbbre való.',
      'Subtle, purposeful movement and interactive details. Ease of use always comes first.',
      'Ingetogen, doelgerichte beweging en interactieve details. Gebruiksgemak gaat altijd voor.',
    ),
    appliesTo: ['website', 'webapp', 'improve', 'ui'],
    price: { kind: 'quote' },
    vat: 'unspecified',
  },
  {
    id: 'api',
    name: tri('Összekötés egy másik szolgáltatással', 'Connect to another service', 'Koppeling met een andere dienst'),
    summary: tri(
      'A weboldalad összekötése egy szolgáltatással vagy eszközzel, amelyet már használsz. Az ajánlat előtt közösen megnézzük, megvalósítható-e.',
      'Connecting your website to a service or tool you already use. Before the quote, we check together whether it can be done.',
      'Je website koppelen aan een dienst of tool die je al gebruikt. Vóór de offerte bekijken we samen of het kan.',
    ),
    appliesTo: ['website', 'webapp', 'improve', 'integrations'],
    price: { kind: 'quote' },
    vat: 'unspecified',
  },
  {
    id: 'performance',
    name: tri('Sebességvizsgálat', 'Speed check', 'Snelheidscontrole'),
    summary: tri(
      'Megnézzük, mennyire gyors egy meglévő oldal vagy alkalmazás, és javítjuk a lassú pontokat.',
      'We check how fast an existing site or application is, and fix the slow spots we find.',
      'We kijken hoe snel een bestaande site of applicatie is en verhelpen de trage plekken die we vinden.',
    ),
    appliesTo: ['website', 'webapp', 'improve', 'ui'],
    price: { kind: 'quote' },
    vat: 'unspecified',
  },
  {
    id: 'languages',
    name: tri('További nyelv', 'Additional language', 'Extra taal'),
    summary: tri(
      'Egy újabb nyelvi változat a meglévő szerkezetben. A szövegek elkészítésének módját az ajánlatban rögzítjük.',
      'An extra language version of the site. We agree in the quote how the texts are produced.',
      'Een extra taalversie van de site. In de offerte leggen we vast hoe de teksten tot stand komen.',
    ),
    appliesTo: ['website', 'webapp', 'improve', 'ui'],
    price: { kind: 'quote' },
    vat: 'unspecified',
  },
  {
    id: 'custom',
    name: tri('Egyedi funkció', 'Custom feature', 'Functie op maat'),
    summary: tri(
      'Valami, ami nincs a listán: leírod, és ha a részletek ismertek, közösen döntjük el, hogy belefér-e.',
      'Something that is not on the list: you describe it, and once the details are known we decide together whether it fits.',
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
      'Folyamatos karbantartás külön megállapodással (lásd a Care csomagot).',
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
