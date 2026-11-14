import { LANGUAGES, type Language } from '../../config.ts'
import { validationFailed, type FieldErrors } from '../../http/errors.ts'
import { isRecord } from '../../lib/text.ts'
import { isEmail } from '../../lib/validate.ts'
import { checkedUrl, emptyTri, Errors, list, pick, str, stringList, tri, type Tri } from '../projects/content.ts'

/**
 * The profile document (PROMPT 22): what the About page says about the owner (the story, what carries over from the earlier field, the
 * technologies, what they are working on now) and the contact details the site shows (an e-mail address and the public profiles). The
 * website has its own copy of all of it in source files and shows that until the owner saves a profile here; from then on this document is
 * the truth for these sections. Nothing is invented: a field nobody filled stays empty and the site shows nothing for it.
 *
 * Every text is `{ hu, en, nl }` and **must be complete in all three languages once it has any**: the website never fills a gap with
 * another language, so a text with a missing translation is refused here, by name, instead of being published half-way. A list entry with no
 * text at all is dropped. Texts are plain text.
 */

export const SKILL_LEVELS = ['learning', 'working', 'confident'] as const
export type SkillLevel = (typeof SKILL_LEVELS)[number]

export interface ProfileDocument {
  story: { title: Tri; paragraphs: Tri[]; thought: Tri }
  strengths: Array<{ id: string; name: Tri; text: Tri }>
  skills: Array<{ id: string; label: Tri; skills: Array<{ name: string; level: SkillLevel | null }> }>
  focus: Array<{ id: string; active: boolean; title: Tri; text: Tri }>
  contact: { email: string; social: Array<{ id: string; label: string; url: string }> }
}

export const PROFILE_LIMITS = { title: 160, paragraph: 1500, paragraphs: 8, thought: 600, strengths: 12, strengthName: 80, strengthText: 300, groups: 8, groupLabel: 60, skills: 24, skillName: 60, focus: 12, focusTitle: 100, focusText: 300, social: 6, socialLabel: 40 } as const

export const emptyProfile = (): ProfileDocument => ({
  story: { title: emptyTri(), paragraphs: [], thought: emptyTri() },
  strengths: [],
  skills: [],
  focus: [],
  contact: { email: '', social: [] },
})

const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/

/** A text that has some language must have every language: the one that lacks it is named. */
function whole(errors: Errors, path: string, value: Tri): Tri {
  if (LANGUAGES.some((language) => value[language] !== '')) for (const language of LANGUAGES) if (value[language] === '') errors.fail(`${path}.${language}`, 'required')
  return value
}
const some = (value: Tri): boolean => LANGUAGES.some((language) => value[language] !== '')

function ids<T extends { id: string }>(items: T[], prefix: string): T[] {
  const seen = new Set<string>()
  return items.map((item, index) => {
    let id = SLUG.test(item.id) && !seen.has(item.id) ? item.id : `${prefix}-${index + 1}`
    while (seen.has(id)) id = `${id}-x`
    seen.add(id)
    return { ...item, id }
  })
}

/** Turns what an administrator's form sends into the canonical document, naming every field that is wrong. */
export function normalizeProfile(input: unknown): { profile: ProfileDocument; errors: FieldErrors } {
  const errors = new Errors()
  const body = isRecord(input) ? input : {}
  if (!isRecord(input)) errors.fail('profile', 'invalid')
  const story = isRecord(body.story) ? body.story : {}
  const contact = isRecord(body.contact) ? body.contact : {}
  const L = PROFILE_LIMITS
  const text = (path: string, value: unknown, max: number, multiline = false) => whole(errors, path, tri(errors, path, value, max, multiline))

  const email = str(errors, 'contact.email', contact.email, 254, false)
  if (email && !isEmail(email)) errors.fail('contact.email', 'invalidEmail')

  const profile: ProfileDocument = {
    story: {
      title: text('story.title', story.title, L.title),
      paragraphs: list(errors, 'story.paragraphs', story.paragraphs, L.paragraphs, (item, at) => text(at, item, L.paragraph, true)).filter(some),
      thought: text('story.thought', story.thought, L.thought, true),
    },
    strengths: ids(
      list(errors, 'strengths', body.strengths, L.strengths, (item, at) => {
        const row = isRecord(item) ? item : {}
        if (!isRecord(item)) errors.fail(at, 'invalid')
        return { id: str(errors, `${at}.id`, row.id, 40, false), name: text(`${at}.name`, row.name, L.strengthName), text: text(`${at}.text`, row.text, L.strengthText, true) }
      }).filter((item) => some(item.name) || some(item.text)),
      'strength',
    ),
    skills: ids(
      list(errors, 'skills', body.skills, L.groups, (item, at) => {
        const row = isRecord(item) ? item : {}
        if (!isRecord(item)) errors.fail(at, 'invalid')
        const levels = isRecord(row.levels) ? row.levels : {}
        const names = stringList(errors, `${at}.names`, row.names, L.skills, L.skillName)
        // The skills arrive as a list of `{ name, level }` or as plain names with a `levels` map; both are the same thing.
        const entries = Array.isArray(row.skills)
          ? list(errors, `${at}.skills`, row.skills, L.skills, (skill, skillAt) => {
              const s = isRecord(skill) ? skill : {}
              if (!isRecord(skill)) errors.fail(skillAt, 'invalid')
              const level = s.level === null || s.level === undefined || s.level === '' ? null : pick(errors, `${skillAt}.level`, s.level, SKILL_LEVELS, 'learning')
              return { name: str(errors, `${skillAt}.name`, s.name, L.skillName, false), level }
            }).filter((skill) => skill.name !== '')
          : names.map((name) => ({ name, level: (typeof levels[name] === 'string' && (SKILL_LEVELS as readonly string[]).includes(levels[name] as string) ? levels[name] : null) as SkillLevel | null }))
        return { id: str(errors, `${at}.id`, row.id, 40, false), label: text(`${at}.label`, row.label, L.groupLabel), skills: [...new Map(entries.map((entry) => [entry.name, entry])).values()] }
      }).filter((group) => some(group.label) || group.skills.length > 0),
      'group',
    ),
    focus: ids(
      list(errors, 'focus', body.focus, L.focus, (item, at) => {
        const row = isRecord(item) ? item : {}
        if (!isRecord(item)) errors.fail(at, 'invalid')
        return { id: str(errors, `${at}.id`, row.id, 40, false), active: row.active !== false, title: text(`${at}.title`, row.title, L.focusTitle), text: text(`${at}.text`, row.text, L.focusText, true) }
      }).filter((item) => some(item.title) || some(item.text)),
      'focus',
    ),
    contact: {
      email,
      social: ids(
        list(errors, 'contact.social', contact.social, L.social, (item, at) => {
          const row = isRecord(item) ? item : {}
          if (!isRecord(item)) errors.fail(at, 'invalid')
          const url = checkedUrl(errors, `${at}.url`, row.url)
          const label = str(errors, `${at}.label`, row.label, L.socialLabel, false)
          if (url && !label) errors.fail(`${at}.label`, 'required')
          return { id: str(errors, `${at}.id`, row.id, 40, false), label, url }
        }).filter((entry) => entry.url !== ''),
        'profile',
      ),
    },
  }
  // A group with a label needs it in every language, and a strength or a focus topic needs both of its texts.
  for (const [index, item] of profile.strengths.entries()) {
    if (some(item.name) !== some(item.text)) errors.fail(`strengths.${index}.${some(item.name) ? 'text' : 'name'}.hu`, 'required')
  }
  for (const [index, item] of profile.focus.entries()) {
    if (some(item.title) !== some(item.text)) errors.fail(`focus.${index}.${some(item.title) ? 'text' : 'title'}.hu`, 'required')
  }
  return { profile, errors: errors.map }
}

export function requireValidProfile(result: { profile: ProfileDocument; errors: FieldErrors }): ProfileDocument {
  if (Object.keys(result.errors).length > 0) throw validationFailed(result.errors)
  return result.profile
}

/** Which languages a text in the document is missing in (used by the editor's marks; the document is already whole when it is stored). */
export const languagesOf = (value: Tri): Language[] => LANGUAGES.filter((language) => value[language] !== '')
