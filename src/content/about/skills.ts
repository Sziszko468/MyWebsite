import { tri, type Trilingual } from '../trilingual'

/**
 * The technologies the About page lists, in groups. The owner named these; how well each is known is
 * theirs to say, and the page does not guess. There is no percentage, no number of years and no
 * certificate anywhere (a test refuses them). `level` is empty for every entry: set one of the three
 * words (`learning`, `working`, `confident`) on a technology to show it next to the name, and leave
 * it `null` to show the name alone. Add, remove or reorder freely; a group with no skills is not shown.
 *
 * No logos: they would need each owner's artwork in one consistent style and used as its maker
 * allows, so the names are set in type instead.
 */

export type SkillLevel = 'learning' | 'working' | 'confident'

export interface Skill {
  /** A proper noun, shown as is in every language. */
  name: string
  level: SkillLevel | null
}

export interface SkillGroup {
  id: string
  label: Trilingual
  skills: readonly Skill[]
}

const skill = (name: string): Skill => ({ name, level: null })

export const skillGroups: readonly SkillGroup[] = [
  {
    id: 'frontend',
    label: tri('Frontend', 'Frontend', 'Frontend'),
    skills: ['HTML5', 'CSS3', 'SCSS', 'JavaScript', 'TypeScript', 'React', 'Vue.js'].map(skill),
  },
  {
    id: 'backend',
    label: tri('Backend', 'Backend', 'Backend'),
    skills: ['Python', 'Django', 'PHP', 'Laravel'].map(skill),
  },
  {
    id: 'database',
    label: tri('Adatbázis', 'Database', 'Database'),
    skills: ['SQL', 'MySQL', 'PostgreSQL'].map(skill),
  },
  {
    id: 'tools',
    label: tri('Eszközök és munkafolyamat', 'Tools & workflow', 'Tools en workflow'),
    skills: ['Git', 'GitHub', 'REST API', 'Vite'].map(skill),
  },
]
