import { describe, expect, it } from 'vitest'
import { LANGUAGES, type Language } from '../../i18n/config'
import { dictionaries } from '../../i18n/dictionaries'
import type { Trilingual } from '../trilingual'
import { activeFocusTopics, approachLoop, approachSteps, focusTopics, siteStack, skillGroups, storyParagraphs, storyThought, storyTitle, transferableSkills } from './index'

/** Every sentence the About page can show, in a language, with where it came from. */
function allText(lang: Language): Array<[where: string, text: string]> {
  const out: Array<[string, string]> = []
  const add = (where: string, value: Trilingual) => out.push([where, value[lang]])

  add('story title', storyTitle)
  storyParagraphs.forEach((p, i) => add(`story paragraph ${i}`, p))
  add('story thought', storyThought)
  for (const skill of transferableSkills) {
    add(`skill ${skill.id} name`, skill.name)
    add(`skill ${skill.id} text`, skill.text)
  }
  for (const step of approachSteps) add(`approach ${step.id}`, step.text)
  add('approach loop', approachLoop)
  for (const group of skillGroups) add(`group ${group.id}`, group.label)
  for (const topic of focusTopics) {
    add(`focus ${topic.id} title`, topic.title)
    add(`focus ${topic.id} text`, topic.text)
  }
  out.push(...flatten(dictionaries[lang].aboutPage, 'aboutPage'))
  return out
}

function flatten(value: unknown, path: string): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]]
  if (Array.isArray(value)) return value.flatMap((item, i) => flatten(item, `${path}[${i}]`))
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => flatten(item, `${path}.${key}`))
  return []
}

describe('the personal story', () => {
  it('has a title, three paragraphs and a closing thought, each in every language', () => {
    expect(storyParagraphs).toHaveLength(3)
    for (const lang of LANGUAGES) {
      expect(storyTitle[lang].trim(), lang).not.toBe('')
      expect(storyThought[lang].trim(), lang).not.toBe('')
      for (const paragraph of storyParagraphs) expect(paragraph[lang].trim(), lang).not.toBe('')
    }
  })

  it('uses the working title and the thought of the brief', () => {
    expect(storyTitle.hu).toBe('A fejlődés nem egyenes vonal.')
    expect(storyThought.hu).toBe(
      'A különböző területeken megszerzett tapasztalatok megtanítottak arra, hogy minden problémának több nézőpontja van. Ezt a szemléletet viszem tovább a fejlesztésben is.',
    )
  })

  it('says that the owner came from logistics and turned to IT on purpose, in every language', () => {
    const first = storyParagraphs[0]
    expect(first.hu).toMatch(/logisztik/i)
    expect(first.hu).toMatch(/tudatos/)
    expect(first.en).toMatch(/logistics/i)
    expect(first.en).toMatch(/conscious/)
    expect(first.nl).toMatch(/logistiek/i)
    expect(first.nl).toMatch(/bewust/)
  })

  it('names the seven transferable skills of the brief, each with one sentence', () => {
    expect(transferableSkills.map((skill) => skill.name.hu)).toEqual([
      'Problémamegoldás',
      'Folyamatok átlátása',
      'Szervezés',
      'Ügyfél-kommunikáció',
      'Csapatmunka',
      'Rendszerszemlélet',
      'Folyamatos tanulás',
    ])
    expect(new Set(transferableSkills.map((skill) => skill.id)).size).toBe(7)
  })
})

describe('what the About page does not make up', () => {
  const YEAR = /\b(19|20)\d{2}\b/
  const COUNT_OF_YEARS = /\d+\s*(\+\s*)?(years?|évet|év\b|éves|jaar|jaren)/i
  const FIGURE = /\d\s*%|%\s*\d|\d+\s*\+|\bpercent|százalék|procent/i
  const CREDENTIAL = /certifi|tanúsítvány|bizonyítvány|oklevél|diploma|degree|vizsga|exam\b|examen|badge|\bscore/i
  const EMPLOYER = /\b(Kft|Zrt|Bt|Nyrt|Ltd|GmbH|B\.V\.|BV|Inc|LLC)\b\.?|munkáltató(m|nk)|employer was|bij het bedrijf/i
  const RESULT = /\b(növelt|csökkent|spórolt|nyert|díj|award|increased|reduced|saved|won|verhoogd|verlaagd)\b/i

  it.each(LANGUAGES)('puts no year, number of years, percentage or score in the text in %s', (lang) => {
    for (const [where, text] of allText(lang)) {
      expect(text, `${lang}: ${where}`).not.toMatch(YEAR)
      expect(text, `${lang}: ${where}`).not.toMatch(COUNT_OF_YEARS)
      expect(text, `${lang}: ${where}`).not.toMatch(FIGURE)
    }
  })

  it.each(LANGUAGES)('names no certificate, exam, employer or result in %s', (lang) => {
    for (const [where, text] of allText(lang)) {
      expect(text, `${lang}: ${where}`).not.toMatch(CREDENTIAL)
      expect(text, `${lang}: ${where}`).not.toMatch(EMPLOYER)
      expect(text, `${lang}: ${where}`).not.toMatch(RESULT)
    }
  })

  it('has no empty sentence in any language', () => {
    for (const lang of LANGUAGES) for (const [where, text] of allText(lang)) expect(text.trim(), `${lang}: ${where}`).not.toBe('')
  })

  it('shows no e-mail address, link or profile id anywhere in its words', () => {
    for (const lang of LANGUAGES) {
      for (const [where, text] of allText(lang)) {
        expect(text, `${lang}: ${where}`).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/)
        expect(text, `${lang}: ${where}`).not.toMatch(/https?:\/\/|www\./i)
      }
    }
  })
})

describe('the way of working', () => {
  it('has the four principles of the brief in order, with their sentences', () => {
    expect(approachSteps.map((step) => step.name)).toEqual(['Understand', 'Design', 'Build', 'Refine'])
    expect(approachSteps.map((step) => step.text.hu)).toEqual([
      'Először megértem a problémát és a felhasználói igényeket.',
      'Átgondolom a struktúrát, az élményt és a vizuális megjelenést.',
      'A megfelelő technológiákkal megvalósítom a megoldást.',
      'Tesztelem, finomítom és továbbfejlesztem a terméket.',
    ])
  })
})

describe('the technologies', () => {
  it('are the ones the owner named, in their groups and their order', () => {
    expect(skillGroups.map((group) => [group.id, group.skills.map((skill) => skill.name)])).toEqual([
      ['frontend', ['HTML5', 'CSS3', 'SCSS', 'JavaScript', 'TypeScript', 'React', 'Vue.js']],
      ['backend', ['Python', 'Django', 'PHP', 'Laravel']],
      ['database', ['SQL', 'MySQL', 'PostgreSQL']],
      ['tools', ['Git', 'GitHub', 'REST API', 'Vite']],
    ])
  })

  it('list each technology once', () => {
    const names = skillGroups.flatMap((group) => group.skills.map((skill) => skill.name))
    expect(new Set(names).size).toBe(names.length)
  })

  it('claim no level until the owner sets one, and then only one of the three words', () => {
    for (const skill of skillGroups.flatMap((group) => group.skills)) {
      expect(['learning', 'working', 'confident', null], skill.name).toContain(skill.level)
      // Shipped empty: the owner finalises the level of each. When they do, update this test to say so.
      expect(skill.level, skill.name).toBeNull()
    }
    for (const lang of LANGUAGES) {
      const { levels } = dictionaries[lang].aboutPage.skills
      expect([levels.learning, levels.working, levels.confident].every((word) => word.trim() && !/\d/.test(word)), lang).toBe(true)
    }
  })

  it('carry no logo: a name in type and nothing else', () => {
    for (const skill of skillGroups.flatMap((group) => group.skills)) {
      expect(Object.keys(skill).sort(), skill.name).toEqual(['level', 'name'])
    }
  })

  it('label every group in every language', () => {
    for (const group of skillGroups) for (const lang of LANGUAGES) expect(group.label[lang].trim(), `${lang}:${group.id}`).not.toBe('')
  })
})

describe('the current focus', () => {
  it('offers the topics of the brief, and shows only the ones marked active', () => {
    expect(focusTopics.map((topic) => topic.id)).toEqual(['frontend', 'fullstack', 'python', 'api', 'responsive', 'data', 'interactive'])
    expect(activeFocusTopics.length).toBeGreaterThan(0)
    expect(activeFocusTopics.every((topic) => topic.active)).toBe(true)
    expect(activeFocusTopics.length).toBeLessThan(focusTopics.length)
  })

  it('describes a direction, never a finished achievement', () => {
    const achieved = /mastered|expert|years of|szakértő|elsajátítottam|jaren ervaring|expert in/i
    for (const topic of focusTopics) for (const lang of LANGUAGES) expect(topic.text[lang], `${lang}:${topic.id}`).not.toMatch(achieved)
  })
})

describe('what this site is built with', () => {
  it('lists its tools once each', () => {
    expect(new Set(siteStack).size).toBe(siteStack.length)
  })
})

describe('the page’s words', () => {
  it('use the Hungarian of the brief for the hero and the closing call to action', () => {
    const hu = dictionaries.hu.aboutPage
    expect(hu.hero.titleLine1).toBe('Nem csak kódot írok.')
    expect(hu.hero.titleLine2).toBe('Digitális élményeket építek.')
    expect(hu.hero.lead).toBe('Hiszek abban, hogy a jó fejlesztés a technológia, a kreativitás és a problémamegoldó gondolkodás találkozásából születik.')
    expect(hu.hero.ctaPrimary).toBe('Nézd meg a munkáimat')
    expect(hu.hero.ctaSecondary).toBe('Lépj kapcsolatba velem')
    expect(hu.final.title).toBe('Építsünk valami maradandót.')
    expect(hu.final.text).toBe('Minden jó projekt egy beszélgetéssel kezdődik.')
    expect(hu.final.cta).toBe('Kapcsolatfelvétel')
    expect(dictionaries.en.aboutPage.final.title).toBe('Let’s build something meaningful.')
  })

  it('differ between the languages', () => {
    for (const key of ['titleLine1', 'titleLine2', 'lead', 'ctaPrimary'] as const) {
      expect(new Set(LANGUAGES.map((lang) => dictionaries[lang].aboutPage.hero[key])).size, key).toBe(3)
    }
  })

  it('keep the same {placeholders} in every language, string by string', () => {
    const tokens = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()
    const reference = new Map(flatten(dictionaries.hu.aboutPage, 'aboutPage').map(([path, text]) => [path, tokens(text)]))
    for (const lang of ['en', 'nl'] as const) {
      const other = flatten(dictionaries[lang].aboutPage, 'aboutPage')
      expect(other.length, lang).toBe(reference.size)
      for (const [path, text] of other) expect(tokens(text), `${lang}: ${path}`).toEqual(reference.get(path))
    }
  })
})
