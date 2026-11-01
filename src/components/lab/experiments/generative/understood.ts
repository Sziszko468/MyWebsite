import type { Understood } from './interpret'
import {
  ACCESSORY_TERMS,
  BUILD_TERMS,
  COLOUR_TERMS,
  CONCEPT_TERMS,
  MATERIAL_TERMS,
  MOOD_TERMS,
  POSE_NAMES,
  PROP_TERMS,
  ROLE_TERMS,
  SIZE_TERMS,
  VIBE_TERMS,
  type ColourId,
  type Lang,
  type RoleId,
  type VibeWord,
} from './lexicon'
import type { AccessoryId, Build, ConceptId, MaterialId, Mood, Pose, PropId, Size } from './spec'

/** What an understood item is called, in the visitor's language. Unknown ids give an empty string. */
export function understoodName(item: Understood, lang: Lang): string {
  const id = item.id
  switch (item.role) {
    case 'subject':
    case 'head':
    case 'vehicle':
    case 'kit':
    case 'companion':
      return CONCEPT_TERMS[id as ConceptId]?.names[lang] ?? ''
    case 'accessory':
      return ACCESSORY_TERMS[id as AccessoryId]?.names[lang] ?? ''
    case 'prop':
      return PROP_TERMS[id as PropId]?.names[lang] ?? ''
    case 'mood':
      return MOOD_TERMS[id as Mood]?.names[lang] ?? ''
    case 'pose':
      return POSE_NAMES[id as Pose]?.[lang] ?? ''
    case 'build':
      return BUILD_TERMS[id as Build]?.names[lang] ?? ''
    case 'size':
      return SIZE_TERMS[id as Size]?.names[lang] ?? ''
    case 'material':
      return MATERIAL_TERMS[id as MaterialId]?.names[lang] ?? ''
    case 'colour':
      return COLOUR_TERMS[id as ColourId]?.names[lang] ?? ''
    case 'style':
      return id.startsWith('role:')
        ? (ROLE_TERMS[id.slice(5) as RoleId]?.names[lang] ?? '')
        : (VIBE_TERMS[id as VibeWord]?.names[lang] ?? '')
  }
}
