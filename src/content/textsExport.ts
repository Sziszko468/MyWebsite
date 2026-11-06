import { LANGUAGES, type Language } from '../i18n/config'
import { dictionaries } from '../i18n/dictionaries'
import { shopText } from './shop'
import { isTrilingualLeaf } from './textOverrides'

/**
 * The list of wordings an administrator may override (server/seed/texts.manifest.json), written from the website's own
 * dictionaries and shop texts by `npm run catalog:seed-export`. A key is `dict.<path>` for the dictionary
 * (the home page, the section titles, the call-to-action labels) or `shop.<path>` for the shop's texts (the front page, the
 * configurator's questions and answers, the cart): the same paths `applyTextOverrides` writes back at run time. It lists what is
 * worth editing and leaves out what is not wording (identifiers, numbers, a text longer than an override may be).
 */

export interface TextKeySeed {
  key: string
  group: string
  label: string
  placeholders: string[]
  default: Record<Language, string>
}

const TEXT_MAX = 600
/** The dictionary's parts that are the site's own voice. The projects' card texts live in the projects themselves, not here. */
const DICTIONARY_PARTS = ['hero', 'cta', 'home', 'aboutPage.hero', 'aboutPage.final', 'contactPage.hero', 'contactPage.form.title', 'contactPage.form.intro', 'project.sections', 'footer.role']
const SKIP = [/^home\.work\.items\./, /\.meta\./]

const PLACEHOLDER = /\{[a-zA-Z0-9]+\}/g

function leaves(value: unknown, path: string, out: Map<string, string>): void {
  if (typeof value === 'string') out.set(path, value)
  else if (Array.isArray(value)) value.forEach((item, index) => leaves(item, `${path}.${index}`, out))
  else if (typeof value === 'object' && value !== null) for (const [key, item] of Object.entries(value)) leaves(item, path ? `${path}.${key}` : key, out)
}

function triLeaves(value: unknown, path: string, out: Map<string, Record<Language, string>>): void {
  if (isTrilingualLeaf(value)) out.set(path, value)
  else if (Array.isArray(value)) value.forEach((item, index) => triLeaves(item, `${path}.${index}`, out))
  else if (typeof value === 'object' && value !== null) for (const [key, item] of Object.entries(value)) triLeaves(item, path ? `${path}.${key}` : key, out)
}

const humanize = (path: string): string => path.replace(/\.(\d+)(?=\.|$)/g, ' #$1').replace(/\./g, ' › ')

export function buildTextsManifest(): { keys: TextKeySeed[] } {
  const keys: TextKeySeed[] = []
  const add = (key: string, group: string, label: string, texts: Record<Language, string>) => {
    if (LANGUAGES.some((lang) => texts[lang].trim() === '' || texts[lang].length > TEXT_MAX)) return
    const placeholders = [...new Set(texts.en.match(PLACEHOLDER) ?? [])]
    keys.push({ key, group, label, placeholders, default: { hu: texts.hu, en: texts.en, nl: texts.nl } })
  }

  const perLanguage = Object.fromEntries(LANGUAGES.map((lang) => [lang, new Map<string, string>()])) as Record<Language, Map<string, string>>
  for (const lang of LANGUAGES) leaves(dictionaries[lang], '', perLanguage[lang])
  for (const path of perLanguage.en.keys()) {
    if (!DICTIONARY_PARTS.some((part) => path === part || path.startsWith(`${part}.`)) || SKIP.some((rule) => rule.test(path))) continue
    if (!LANGUAGES.every((lang) => perLanguage[lang].has(path))) continue
    const group = path.split('.').slice(0, 2).join('.')
    add(`dict.${path}`, `Website: ${group}`, humanize(path), { hu: perLanguage.hu.get(path) as string, en: perLanguage.en.get(path) as string, nl: perLanguage.nl.get(path) as string })
  }

  const shop = new Map<string, Record<Language, string>>()
  triLeaves(shopText, '', shop)
  for (const [path, texts] of shop) add(`shop.${path}`, `Shop: ${path.split('.')[0]}`, humanize(path), texts)
  return { keys }
}
