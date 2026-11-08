import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Language } from '../../i18n/config'
import type { Trilingual } from '../trilingual'
import { aiText } from './index'
import { launcherText } from './launcher'
import { aiMeta } from './meta'

/**
 * CONTROL ROOM AI's words (PROMPT 16): three languages everywhere, the same placeholders in every language, and nothing in the
 * interface that the assistant itself may not say: no price, no discount, no delivery time, no promise.
 */

const LANGUAGES: Language[] = ['hu', 'en', 'nl']

function leaves(value: unknown, path: string, into: { path: string; text: Trilingual }[] = []): { path: string; text: Trilingual }[] {
  if (typeof value !== 'object' || value === null) return into
  const candidate = value as Record<string, unknown>
  if (typeof candidate.hu === 'string' && typeof candidate.en === 'string' && typeof candidate.nl === 'string') {
    into.push({ path, text: candidate as unknown as Trilingual })
    return into
  }
  for (const [key, item] of Object.entries(candidate)) leaves(item, `${path}.${key}`, into)
  return into
}

const all = [...leaves(aiText, 'aiText'), ...leaves(launcherText, 'launcher'), ...leaves(aiMeta, 'meta')]
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

describe('the assistant\'s interface texts', () => {
  it('has a good number of texts, every one of them written in all three languages', () => {
    expect(all.length).toBeGreaterThan(120)
    for (const { path, text } of all) {
      for (const language of LANGUAGES) expect(text[language].trim().length, `${path} (${language})`).toBeGreaterThan(0)
    }
  })

  it('uses the same placeholders in every language, so a sentence never loses a number or a name', () => {
    for (const { path, text } of all) {
      expect(placeholders(text.hu), `${path}: hu against en`).toEqual(placeholders(text.en))
      expect(placeholders(text.nl), `${path}: nl against en`).toEqual(placeholders(text.en))
    }
  })

  it('translates, rather than copies, the sentences (only brand names, terms and numbers may be alike in all three)', () => {
    const same = all.filter(({ text }) => text.hu === text.en && text.en === text.nl && /\s/.test(text.en.trim()) && !/^[A-Z ]+$/.test(text.en) && !/^\{/.test(text.en) && text.en !== 'Control Room AI')
    expect(same.map(({ path, text }) => `${path}: ${text.en}`)).toEqual([])
  })

  it('states no price, discount, delivery time, guarantee or result anywhere', () => {
    const forbidden = /[€$£]|\b(?:eur|usd|huf|ft|euro|dollar|forint)\b|\d\s*%|garant|guarantee|garantie|discount|kedvezm|korting|testimonial|ügyfélvélemény|klantbeoordeling/i
    for (const { path, text } of all) {
      for (const language of LANGUAGES) expect(text[language], `${path} (${language})`).not.toMatch(forbidden)
    }
  })

  it('never lets the assistant speak as the website\'s owner', () => {
    expect(aiText.welcome.hu).not.toMatch(/projektjeim|az én projekt|készítettem/i)
    expect(aiText.identity.en).toMatch(/AI/)
    expect(aiText.identity.hu).toMatch(/mesterséges intelligencia/i)
    expect(aiText.identity.nl).toMatch(/AI/)
    for (const chip of aiText.chips) {
      for (const language of LANGUAGES) expect(chip.prompt[language], chip.id).not.toMatch(/\b(?:your|jouw|your own)\s+projects\b|projektjeid/i)
    }
  })

  it('offers six suggested questions that fit the message box, each with its own id', () => {
    expect(aiText.chips).toHaveLength(6)
    expect(new Set(aiText.chips.map((chip) => chip.id)).size).toBe(6)
    for (const chip of aiText.chips) {
      for (const language of LANGUAGES) {
        expect(chip.label[language].length, `${chip.id} label`).toBeLessThanOrEqual(48)
        expect(chip.prompt[language].length, `${chip.id} prompt`).toBeLessThanOrEqual(240)
      }
    }
  })

  it('has a line for every one of the eight tools, and no line for a tool that does not exist', () => {
    // The names are the server's closed set (server/src/modules/ai/tools.ts); server/test/ai.test.ts holds the other half of this check.
    const tools = ['getDeveloperProfile', 'searchPortfolioProjects', 'getProjectDetails', 'getPublishedServices', 'comparePackages', 'getFullExperienceDetails', 'createProjectPlan', 'submitApprovedQuoteRequest']
    expect(Object.keys(aiText.status.tool).sort()).toEqual([...tools].sort())
  })

  it('has words for every failure the server or the stream can name', () => {
    const codes = ['generic', 'assistant_error', 'provider_unavailable', 'provider_rate_limit', 'provider_auth', 'provider_error', 'timeout', 'refusal', 'network', 'rate_limited', 'session_requests', 'unavailable', 'budget', 'conversation_expired', 'conversation_full', 'busy']
    for (const code of codes) expect(aiText.errors, code).toHaveProperty(code)
  })

  it('does not tell a visitor which provider, model or key stands behind the assistant, nor what an error said', () => {
    const forbidden = /anthropic|claude|haiku|api key|api-key|token|\b4\d\d\b|\b5\d\d\b|stack|exception/i
    for (const { path, text } of leaves(aiText.errors, 'errors')) {
      for (const language of LANGUAGES) expect(text[language], `${path} (${language})`).not.toMatch(forbidden)
    }
  })

  it('keeps the privacy notice honest about days, deletion and sensitive data', () => {
    expect(aiText.privacy.notice.en).toMatch(/\{days\}/)
    expect(aiText.privacy.notice.en).toMatch(/delete/i)
    expect(aiText.privacy.notice.hu).toMatch(/töröl/i)
    expect(aiText.privacy.notice.nl).toMatch(/verwijder/i)
    for (const language of LANGUAGES) expect(aiText.privacy.notice[language]).toMatch(/AI/)
  })

  it('never asks for contact details inside the conversation, only in the plan panel', () => {
    expect(aiText.send.lead.en).toMatch(/here, not in the chat/i)
    expect(aiText.send.lead.hu).toMatch(/ne a beszélgetésben/i)
    expect(aiText.send.lead.nl).toMatch(/niet in het gesprek/i)
  })

  it('is the interface the server\'s prompt expects: the button the assistant tells visitors about exists', () => {
    expect(aiText.send.approve.en).toBe('Send this request')
    const prompt = readFileSync(new URL('../../../server/src/modules/ai/prompt.ts', import.meta.url), 'utf8')
    expect(prompt).toContain('"Send this request"')
  })
})
