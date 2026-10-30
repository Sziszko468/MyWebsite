import { tri, type Trilingual } from '../trilingual'

/**
 * What the owner is working on now. Only directions they actually take on belong here: a plan or a
 * topic they are still learning is not current professional experience, and the sentences describe
 * a direction, never an achievement. Set `active` to `false` to hide a topic without deleting it;
 * `data` ships hidden until the owner says it is theirs. Six of the seven are backed by what the
 * portfolio projects in `content/projectDetails/` show; the owner has the last word.
 */

export interface FocusTopic {
  id: string
  /** Shown on the page only while `true`. */
  active: boolean
  title: Trilingual
  text: Trilingual
}

export const focusTopics: readonly FocusTopic[] = [
  {
    id: 'frontend',
    active: true,
    title: tri('Modern frontend fejlesztés', 'Modern frontend development', 'Moderne frontendontwikkeling'),
    text: tri(
      'Reszponzív, hozzáférhető felületek React-tel és TypeScripttel.',
      'Responsive, accessible interfaces with React and TypeScript.',
      'Responsieve, toegankelijke interfaces met React en TypeScript.',
    ),
  },
  {
    id: 'fullstack',
    active: true,
    title: tri('Full-stack webalkalmazások', 'Full-stack web applications', 'Full-stack webapplicaties'),
    text: tri(
      'A felülettől az adatbázisig: frontend és backend egy működő egészként.',
      'From the interface to the database: frontend and back end as one working whole.',
      'Van de interface tot de database: frontend en back-end als één werkend geheel.',
    ),
  },
  {
    id: 'python',
    active: true,
    title: tri('Python és Django', 'Python and Django', 'Python en Django'),
    text: tri(
      'Backend és API fejlesztés Pythonnal és Djangóval.',
      'Back-end and API development with Python and Django.',
      'Back-end- en API-ontwikkeling met Python en Django.',
    ),
  },
  {
    id: 'api',
    active: true,
    title: tri('API-integrációk', 'API integrations', 'API-integraties'),
    text: tri(
      'Külső szolgáltatások és saját API-k összekapcsolása.',
      'Connecting external services and APIs of my own.',
      'Externe diensten en eigen API’s met elkaar verbinden.',
    ),
  },
  {
    id: 'responsive',
    active: true,
    title: tri('Reszponzív alkalmazások', 'Responsive applications', 'Responsieve applicaties'),
    text: tri(
      'Ugyanaz a jó élmény telefonon, tableten és asztali gépen.',
      'The same good experience on a phone, a tablet and a desktop.',
      'Dezelfde goede ervaring op telefoon, tablet en desktop.',
    ),
  },
  {
    id: 'data',
    active: false,
    title: tri('Adatvezérelt megoldások', 'Data-driven solutions', 'Datagedreven oplossingen'),
    text: tri(
      'Olyan felületek, amelyek az adatból érthető képet adnak.',
      'Interfaces that turn data into a picture people can read.',
      'Interfaces die van data een leesbaar beeld maken.',
    ),
  },
  {
    id: 'interactive',
    active: true,
    title: tri('Interaktív digitális élmények', 'Interactive digital experiences', 'Interactieve digitale ervaringen'),
    text: tri(
      'Mozgás, pointerreakció és vizuális részletek, amelyek segítik a használatot, nem akadályozzák.',
      'Motion, pointer response and visual detail that help use rather than get in its way.',
      'Beweging, aanwijzerreactie en visuele details die het gebruik helpen in plaats van hinderen.',
    ),
  },
]

export const activeFocusTopics = focusTopics.filter((topic) => topic.active)
