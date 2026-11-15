import { tri } from './trilingual'

/** The privacy notice's title and description (browser tab, search result, shared link). Kept apart from its text so the page frame can read them without loading it. */
export const privacyMeta = {
  title: tri('Adatvédelem és sütik', 'Privacy and cookies', 'Privacy en cookies'),
  description: tri(
    'Mit tárol és mit küld el ez az oldal: egyetlen nyelvi süti, a böngészőben tárolt beállítások listája, az űrlapok és a konzultációfoglalás működése, és a mérés szabályai.',
    'What this site stores and sends: one language cookie, the list of settings kept in your browser, how the forms and the consultation booking work, and the rules for measurement.',
    'Wat deze site bewaart en verstuurt: één cookie voor je taalkeuze, de lijst met instellingen in je browser, hoe de formulieren en het inplannen van een adviesgesprek werken en de regels voor meten.',
  ),
}
