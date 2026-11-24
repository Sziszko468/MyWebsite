import { tri } from '../trilingual'

/**
 * What the Design System Playground says in the browser's tab and in a search result or a share (PROMPT 36). It is its own small file on purpose: the head is built for
 * every page of the site, so this is read by the site's main code, while the playground's other words (text.ts) load only with the page.
 */
export const playgroundMeta = {
  title: tri('Design System Playground, dizájneszköz', 'Design System Playground, a design tool', 'Design System Playground, een ontwerpgereedschap'),
  description: tri(
    'Próbáld ki a Controlled Chaos dizájnrendszerét: színek, betűtípusok, komponensek, elrendezés és mozgás élő előnézettel. Semmi nem mentődik, és a weboldal sem változik.',
    'Try the Controlled Chaos design system: colours, type, components, layout and motion with a live preview. Nothing is saved and the website itself never changes.',
    'Probeer het designsysteem van Controlled Chaos: kleuren, lettertypen, componenten, layout en beweging met een live voorbeeld. Er wordt niets opgeslagen en de website zelf verandert nooit.',
  ),
}
