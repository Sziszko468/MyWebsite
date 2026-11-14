import { useEffect, useSyncExternalStore } from 'react'
import { API_BASE } from '../config/api'
import { siteConfig, type SiteConfig } from '../config/site'
import { activeFocusTopics, skillGroups, storyParagraphs, storyThought, storyTitle, transferableSkills, type FocusTopic, type Skill, type SkillGroup, type TransferableSkill } from '../content/about'
import type { Trilingual } from '../content/trilingual'
import { LANGUAGES } from '../i18n/config'
import { getJson } from '../projects/api'

/**
 * The About page's words and the contact details (PROMPT 22). The website carries its own copy of both in source files and shows it until the owner
 * saves a profile in the administration; from then on `/api/profile` is the truth for these parts. The server refuses a text that lacks a language,
 * so a saved text exists in all three and the page never shows another language's words in place of a missing one. Where there is no backend, or it
 * does not answer, the website's own copy is shown, as before. One small store, read by `useSyncExternalStore` (the first render is always the
 * website's own copy, so the page the build wrote and the page the browser draws first are the same).
 */

export interface AboutContent {
  title: Trilingual
  paragraphs: readonly Trilingual[]
  thought: Trilingual
  strengths: readonly TransferableSkill[]
  skillGroups: readonly SkillGroup[]
  focus: readonly FocusTopic[]
}

export interface ContactDetails {
  email: string | null
  social: SiteConfig['social']
}

interface Saved {
  about: AboutContent
  contact: ContactDetails
}

const ownAbout: AboutContent = { title: storyTitle, paragraphs: storyParagraphs, thought: storyThought, strengths: transferableSkills, skillGroups, focus: activeFocusTopics }
const ownContact: ContactDetails = { email: siteConfig.contact.email, social: siteConfig.social }

let saved: Saved | null = null
let requested = false
const listeners = new Set<() => void>()
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

function triOf(value: unknown): Trilingual {
  const source = isObject(value) ? value : {}
  const text = (code: (typeof LANGUAGES)[number]) => (typeof source[code] === 'string' ? (source[code] as string) : '')
  return { hu: text('hu'), en: text('en'), nl: text('nl') }
}
const levelOf = (value: unknown): Skill['level'] => (value === 'learning' || value === 'working' || value === 'confident' ? value : null)
const hasText = (value: Trilingual): boolean => LANGUAGES.some((code) => value[code] !== '')
const httpsAddress = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

/** A saved document as the website reads it. Anything that is not what the server promises is left out, never replaced by the website's own text. */
export function parseProfile(raw: unknown): Saved | null {
  if (!isObject(raw)) return null
  const story = isObject(raw.story) ? raw.story : {}
  const contact = isObject(raw.contact) ? raw.contact : {}
  const about: AboutContent = {
    title: triOf(story.title),
    paragraphs: array(story.paragraphs).map(triOf).filter(hasText),
    thought: triOf(story.thought),
    strengths: array(raw.strengths)
      .filter(isObject)
      .map((item, index) => ({ id: typeof item.id === 'string' ? item.id : `strength-${index + 1}`, name: triOf(item.name), text: triOf(item.text) }))
      .filter((item) => hasText(item.name)),
    skillGroups: array(raw.skills)
      .filter(isObject)
      .map((group, index) => ({
        id: typeof group.id === 'string' ? group.id : `group-${index + 1}`,
        label: triOf(group.label),
        skills: array(group.skills)
          .filter(isObject)
          .flatMap((skill) => (typeof skill.name === 'string' && skill.name !== '' ? [{ name: skill.name, level: levelOf(skill.level) }] : [])),
      }))
      .filter((group) => group.skills.length > 0),
    focus: array(raw.focus)
      .filter(isObject)
      .map((item, index) => ({ id: typeof item.id === 'string' ? item.id : `focus-${index + 1}`, active: item.active !== false, title: triOf(item.title), text: triOf(item.text) }))
      .filter((item) => item.active && hasText(item.title)),
  }
  const social = array(contact.social)
    .filter(isObject)
    .flatMap((entry, index) => {
      const url = httpsAddress(entry.url)
      return url && typeof entry.label === 'string' && entry.label !== '' ? [{ id: typeof entry.id === 'string' ? entry.id : `social-${index + 1}`, label: entry.label, url }] : []
    })
  return { about, contact: { email: typeof contact.email === 'string' && contact.email !== '' ? contact.email : null, social } }
}

/** Asks for the saved profile once (a visitor's browser asks once per visit; the server answers from a 30-second cache). */
export function ensureProfile(): void {
  if (requested || API_BASE === null) return
  requested = true
  void (async () => {
    const outcome = await getJson('/api/profile')
    if (outcome.kind === 'ok') saved = parseProfile(outcome.data)
    // No answer at all: ask again the next time a page needs it. A 404 (an older backend) or a null answer (nothing saved) is an answer.
    else if (outcome.kind === 'error') requested = false
    for (const listener of listeners) listener()
  })()
}

const read = (): Saved | null => saved

function useSaved(): Saved | null {
  useEffect(() => ensureProfile(), [])
  return useSyncExternalStore(subscribe, read, () => null)
}

/** The About page's words: the saved profile's once the owner has saved one, else the website's own. */
export function useAboutContent(): AboutContent {
  return useSaved()?.about ?? ownAbout
}

/** The contact details the footer, the contact page, the privacy page and the request forms show. */
export function useContact(): ContactDetails {
  return useSaved()?.contact ?? ownContact
}

/** For tests: back to the start. */
export function resetProfileStore(next: unknown = null): void {
  saved = next === null ? null : parseProfile(next)
  requested = next !== null
  for (const listener of listeners) listener()
}
