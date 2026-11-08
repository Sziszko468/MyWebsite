import { siteConfig, BRAND_PLACEHOLDER } from '../config/site'
import { LANGUAGES, type Language } from '../i18n/config'
import { activeFocusTopics, approachSteps, siteStack, skillGroups, storyParagraphs, storyThought, storyTitle, transferableSkills } from './about'
import type { Trilingual } from './trilingual'

/**
 * The public profile of the website's owner as data for the backend (server/seed/profile.seed.json), so the assistant can
 * answer about the developer from what the About page already says and from nothing else. The About content stays the
 * source: `npm run catalog:seed-export` writes the JSON from it and a test fails when the file is out of date.
 *
 * What is NOT here is as important as what is: no employer, no dates, no results, no clients, and no name while the site's
 * brand name is still the placeholder (`name: null`). The assistant is told which of these are unpublished so that it says
 * "that is not published" instead of guessing.
 */

const texts = (value: Trilingual): Record<Language, string> => Object.fromEntries(LANGUAGES.map((lang) => [lang, value[lang]])) as Record<Language, string>

export interface ProfileSeed {
  version: 1
  /** `null` while the site still carries the template's placeholder brand name. */
  name: string | null
  story: { title: Record<Language, string>; paragraphs: Record<Language, string>[]; thought: Record<Language, string> }
  strengths: { id: string; name: Record<Language, string>; text: Record<Language, string> }[]
  /** Technology groups; proper nouns, with no level, percentage or number of years (the About page claims none). */
  technologies: { id: string; label: Record<Language, string>; items: string[] }[]
  approach: { id: string; name: string; text: Record<Language, string> }[]
  focus: { id: string; title: Record<Language, string>; text: Record<Language, string> }[]
  /** The tools this very website is built with, a fact about the site. */
  siteStack: string[]
  contact: { email: string | null; social: { id: string; label: string; url: string }[]; contactPagePath: string }
}

export function buildProfileSeed(): ProfileSeed {
  return {
    version: 1,
    name: siteConfig.brandName === BRAND_PLACEHOLDER ? null : siteConfig.brandName,
    story: { title: texts(storyTitle), paragraphs: storyParagraphs.map(texts), thought: texts(storyThought) },
    strengths: transferableSkills.map((skill) => ({ id: skill.id, name: texts(skill.name), text: texts(skill.text) })),
    technologies: skillGroups.map((group) => ({ id: group.id, label: texts(group.label), items: group.skills.map((skill) => skill.name) })),
    approach: approachSteps.map((step) => ({ id: step.id, name: step.name, text: texts(step.text) })),
    focus: activeFocusTopics.map((topic) => ({ id: topic.id, title: texts(topic.title), text: texts(topic.text) })),
    siteStack: [...siteStack],
    contact: {
      email: siteConfig.contact.email,
      social: siteConfig.social.flatMap((profile) => (profile.url ? [{ id: profile.id, label: profile.label, url: profile.url }] : [])),
      contactPagePath: '/contact',
    },
  }
}
