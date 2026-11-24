import { BRAND_IDS, BRAND_TOKENS, originalPalette, parseHex, type BrandId, type HexError, type Palette, type PreviewTheme } from './color'
import { clampLayout, type LayoutState } from './layout'
import { clampMotion, MOTION_DEFAULTS, type MotionState } from './motion'
import { clampType, type TypeState } from './typography'

/**
 * Everything a visitor changes in the Design System Playground (PROMPT 36), in ONE value that lives in the page's own component state (`useReducer`). It is never
 * written anywhere: not to the theme or the tokens of the site, not to storage, not to the network. Leaving the page drops it; `reset` restores the originals.
 * Plain data and a reducer, no React and no DOM, so isolation and reset can be tested alone.
 */

export interface ColorState {
  /** What is in each HEX field (as typed, valid or not). */
  draft: Palette
  /** The last valid colour of each field: what the preview uses. */
  palette: Palette
  errors: Partial<Record<BrandId, HexError>>
  /** The pair the "try a pair" preview shows. */
  fg: BrandId
  bg: BrandId
}

export const COMPONENT_IDS = ['button', 'badge', 'fields', 'link', 'navigation', 'heading', 'service', 'project'] as const
export type ComponentId = (typeof COMPONENT_IDS)[number]

export interface ComponentsState {
  selected: ComponentId
  button: { variant: 'primary' | 'secondary' | 'text'; size: 'sm' | 'md' | 'lg'; arrow: boolean; fullWidth: boolean; disabled: boolean; status: 'none' | 'success' | 'error' }
  badge: { kind: 'live' | 'demo' | 'in-progress' | 'concept' | 'neutral' }
  fields: { invalid: boolean; hint: boolean; disabled: boolean }
  link: { underline: boolean }
  navigation: { variant: 'bar' | 'footer' }
  heading: { size: 'default' | 'large' | 'stacked'; description: boolean; index: boolean }
  service: { featured: boolean; price: 'quote' | 'tbd'; action: boolean }
  project: { layout: 'default' | 'lead' | 'offset' | 'compact' | 'wide' | 'row'; status: 'live' | 'demo' | 'in-progress' | 'concept'; link: boolean }
}

export const REPLAY_IDS = ['hover', 'button', 'entrance', 'reveal', 'micro', 'page', 'components'] as const
export type ReplayId = (typeof REPLAY_IDS)[number]

export interface PlaygroundState {
  /** Which theme the PREVIEWS carry. It starts as the site's theme and changes nothing about the site. */
  theme: PreviewTheme
  color: ColorState
  type: TypeState
  layout: LayoutState
  motion: MotionState
  components: ComponentsState
  /** How many times each animation example has been asked to play again; a new number restarts it. */
  replay: Record<ReplayId, number>
}

export const originalColor = (): ColorState => ({ draft: originalPalette(), palette: originalPalette(), errors: {}, fg: 'paper', bg: 'black' })

export const originalType = (): TypeState => ({
  family: 'archivo',
  size: 18,
  headingWeight: 800,
  bodyWeight: 400,
  lineHeight: 1.5,
  tracking: 0,
  width: 100,
  ratio: 1.25,
  heading: '',
  body: '',
  caption: '',
})

export const originalLayout = (): LayoutState => ({ container: 960, columns: 3, gap: 24, padding: 24, radius: 14, align: 'stretch', previewWidth: 1280 })

export const originalMotion = (): MotionState => ({ ...MOTION_DEFAULTS, simulateReduced: false })

export const originalComponents = (): ComponentsState => ({
  selected: 'button',
  button: { variant: 'primary', size: 'md', arrow: true, fullWidth: false, disabled: false, status: 'none' },
  badge: { kind: 'demo' },
  fields: { invalid: false, hint: true, disabled: false },
  link: { underline: true },
  navigation: { variant: 'bar' },
  heading: { size: 'default', description: true, index: true },
  service: { featured: false, price: 'quote', action: true },
  project: { layout: 'default', status: 'demo', link: true },
})

export const originalReplay = (): Record<ReplayId, number> => ({ hover: 0, button: 0, entrance: 0, reveal: 0, micro: 0, page: 0, components: 0 })

/** The state a visit starts from. `siteTheme` is the theme the site is in when the page opens. A new object every time: no two states share anything. */
export function initialState(siteTheme: PreviewTheme): PlaygroundState {
  return { theme: siteTheme, color: originalColor(), type: originalType(), layout: originalLayout(), motion: originalMotion(), components: originalComponents(), replay: originalReplay() }
}

export type ResetScope = 'all' | 'color' | 'type' | 'layout' | 'motion' | 'components'

export type Action =
  | { type: 'theme'; theme: PreviewTheme }
  | { type: 'color/draft'; id: BrandId; value: string }
  | { type: 'color/pick'; id: BrandId; hex: string }
  | { type: 'color/pair'; fg?: BrandId; bg?: BrandId }
  | { type: 'type/set'; patch: Partial<TypeState> }
  | { type: 'layout/set'; patch: Partial<LayoutState> }
  | { type: 'motion/set'; patch: Partial<MotionState> }
  | { type: 'components/select'; id: ComponentId }
  | { type: 'components/set'; id: ComponentId; patch: Record<string, string | boolean> }
  | { type: 'components/reset'; id: ComponentId }
  | { type: 'replay'; id: ReplayId }
  | { type: 'reset'; scope: ResetScope; siteTheme: PreviewTheme }

const isBrandId = (value: unknown): value is BrandId => typeof value === 'string' && (BRAND_IDS as readonly string[]).includes(value)

export function reducer(state: PlaygroundState, action: Action): PlaygroundState {
  switch (action.type) {
    case 'theme':
      return action.theme === 'dark' || action.theme === 'light' ? { ...state, theme: action.theme } : state
    case 'color/draft': {
      if (!isBrandId(action.id) || typeof action.value !== 'string') return state
      const value = action.value.slice(0, 24)
      const parsed = parseHex(value)
      const errors = { ...state.color.errors }
      if (parsed.ok) delete errors[action.id]
      else errors[action.id] = parsed.error
      return { ...state, color: { ...state.color, draft: { ...state.color.draft, [action.id]: value }, palette: parsed.ok ? { ...state.color.palette, [action.id]: parsed.hex } : state.color.palette, errors } }
    }
    case 'color/pick': {
      const parsed = parseHex(String(action.hex))
      if (!isBrandId(action.id) || !parsed.ok) return state
      const errors = { ...state.color.errors }
      delete errors[action.id]
      return { ...state, color: { ...state.color, draft: { ...state.color.draft, [action.id]: parsed.hex }, palette: { ...state.color.palette, [action.id]: parsed.hex }, errors } }
    }
    case 'color/pair':
      return { ...state, color: { ...state.color, fg: isBrandId(action.fg) ? action.fg : state.color.fg, bg: isBrandId(action.bg) ? action.bg : state.color.bg } }
    case 'type/set':
      return { ...state, type: clampType({ ...state.type, ...action.patch }, originalType()) }
    case 'layout/set':
      return { ...state, layout: clampLayout({ ...state.layout, ...action.patch }, originalLayout()) }
    case 'motion/set':
      return { ...state, motion: clampMotion({ ...state.motion, ...action.patch }, originalMotion()) }
    case 'components/select':
      return (COMPONENT_IDS as readonly string[]).includes(action.id) ? { ...state, components: { ...state.components, selected: action.id } } : state
    case 'components/set': {
      if (!(COMPONENT_IDS as readonly string[]).includes(action.id)) return state
      const key = action.id
      const current = state.components[key]
      if (typeof current !== 'object' || current === null) return state
      // Only keys the group has, and only values of the type it has (a boolean stays a boolean, a choice stays one of its own words).
      const original = originalComponents()[key] as unknown as Record<string, unknown>
      const next = { ...(current as unknown as Record<string, unknown>) }
      for (const [name, value] of Object.entries(action.patch)) {
        if (!(name in original) || typeof value !== typeof original[name]) continue
        next[name] = value
      }
      return { ...state, components: { ...state.components, [key]: next } as ComponentsState }
    }
    case 'components/reset': {
      if (!(COMPONENT_IDS as readonly string[]).includes(action.id)) return state
      // A new number restarts what the component's preview keeps for itself (the text typed into a field, a pressed button).
      return { ...state, components: { ...state.components, [action.id]: originalComponents()[action.id] } as ComponentsState, replay: { ...state.replay, components: state.replay.components + 1 } }
    }
    case 'replay':
      return (REPLAY_IDS as readonly string[]).includes(action.id) ? { ...state, replay: { ...state.replay, [action.id]: state.replay[action.id] + 1 } } : state
    case 'reset': {
      const original = initialState(action.siteTheme === 'light' ? 'light' : 'dark')
      switch (action.scope) {
        case 'all':
          // A reset keeps the replay counters moving (a new number restarts every example) and everything else comes back as it was.
          return { ...original, replay: Object.fromEntries(REPLAY_IDS.map((id) => [id, state.replay[id] + 1])) as Record<ReplayId, number> }
        case 'color':
          return { ...state, color: original.color }
        case 'type':
          return { ...state, type: original.type }
        case 'layout':
          return { ...state, layout: original.layout }
        case 'motion':
          return { ...state, motion: original.motion, replay: Object.fromEntries(REPLAY_IDS.map((id) => [id, state.replay[id] + 1])) as Record<ReplayId, number> }
        case 'components':
          return { ...state, components: original.components, replay: { ...state.replay, components: state.replay.components + 1 } }
      }
      return state
    }
    default:
      return state
  }
}

/** Which brand colours the visitor has changed from the original (valid values only). */
export const changedColors = (color: ColorState): BrandId[] => BRAND_IDS.filter((id) => color.palette[id] !== BRAND_TOKENS[id].hex)

/** Whether anything in the playground differs from where a visit starts (the theme of the previews counts only if it differs from the site's). */
export function isChanged(state: PlaygroundState, siteTheme: PreviewTheme): boolean {
  const original = initialState(siteTheme)
  return JSON.stringify({ ...state, replay: 0 }) !== JSON.stringify({ ...original, replay: 0 })
}
