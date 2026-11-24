import { tri } from '../trilingual'

/**
 * What the Lab's overview says about the playground (PROMPT 36): one quiet band after the six experiences, a link to the tool. It is a small file of its own because the
 * Lab page reads it, while the playground's other words (text.ts) load only with the playground's page. The playground is a tool, NOT a seventh experience.
 */
export const playgroundEntry = {
  kicker: tri('Eszköz, nem kísérlet', 'A tool, not an experiment', 'Een gereedschap, geen experiment'),
  title: tri('Design System Playground', 'Design System Playground', 'Design System Playground'),
  text: tri(
    'A hat élmény mellett itt van a dizájnrendszer is, kézbe vehetően: változtass színeket, betűtípust, elrendezést és mozgást, és nézd a valódi komponenseken, hogyan áll össze. Semmi nem mentődik.',
    'Beside the six experiences, here is the design system itself to handle: change colours, type, layout and motion and watch the real components take them. Nothing is saved.',
    'Naast de zes ervaringen is hier het designsysteem zelf om aan te pakken: verander kleuren, lettertype, layout en beweging en zie hoe de echte componenten ze overnemen. Er wordt niets opgeslagen.',
  ),
  open: tri('Megnyitás', 'Open the playground', 'Open het gereedschap'),
}
