import { tri } from './trilingual'

/** The privacy notice's title and description (browser tab, search result, shared link). Kept apart from its text so the page frame can read them without loading it. */
export const privacyMeta = {
  title: tri('Adatvédelem és sütik', 'Privacy and cookies', 'Privacy en cookies'),
  description: tri(
    'Mit tárol és mit küld el ez az oldal: sütik nincsenek, a böngészőben tárolt beállítások listája, az űrlapok működése és a mérés szabályai.',
    'What this site stores and sends: no cookies, the list of settings kept in your browser, how the forms work and the rules for measurement.',
    'Wat deze site bewaart en verstuurt: geen cookies, de lijst met instellingen in je browser, hoe de formulieren werken en de regels voor meten.',
  ),
}
