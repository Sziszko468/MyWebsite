import type { Language } from './config'
import { en } from './locales/en'
import { hu, type Dictionary } from './locales/hu'
import { nl } from './locales/nl'

export const dictionaries: Record<Language, Dictionary> = { hu, en, nl }
