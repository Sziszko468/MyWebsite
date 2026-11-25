import { tri } from '../trilingual'

/**
 * What the Command Center and the Digital Archive say in the browser's tab and in a search result or a share (PROMPT 37). A small file of its own on purpose: the head is
 * built for every page of the site, so the site's main code reads this, while the pages' other words (text.ts) load only with the pages.
 */
export const commandCenterMeta = {
  title: tri('Irányítóközpont', 'Command Center', 'Commandocentrum'),
  description: tri(
    'Belépési pont a Controlled Chaos portfólióhoz: kiemelt munkák, digitális archívum, a Lab hat élménye, interaktív bemutatók, szolgáltatások és kapcsolat.',
    'The way into the Controlled Chaos portfolio: featured work, the digital archive, the six experiences of the Lab, interactive demos, services and contact.',
    'De toegang tot het portfolio van Controlled Chaos: uitgelicht werk, het digitale archief, de zes ervaringen van het Lab, interactieve demo’s, diensten en contact.',
  ),
}

export const archiveMeta = {
  title: tri('Digitális archívum', 'Digital Archive', 'Digitaal archief'),
  description: tri(
    'A Controlled Chaos nyilvános munkái egy helyen: projektek, interaktív bemutatók, Lab-élmények és a dizájneszköz, kereshető, szűrhető és rendezhető listában.',
    'The public work of Controlled Chaos in one place: projects, interactive demos, Lab experiences and the design tool, in a list you can search, filter and sort.',
    'Het openbare werk van Controlled Chaos op één plek: projecten, interactieve demo’s, Lab-ervaringen en het ontwerpgereedschap, in een lijst die je kunt doorzoeken, filteren en sorteren.',
  ),
}
