import type { AdminText } from '../i18n/en'
import type { IconName } from './Icon'

/**
 * The places in the administration, in one list: the sidebar, the phone's bottom bar and its "More" sheet all read it,
 * and so does the test that every place has a screen. Nothing is listed that has no screen behind it and no backend
 * support. The pictures are chosen inside the project editor and also have a library screen of their own (PROMPT 22).
 */
export interface NavItem {
  id: 'dashboard' | 'inquiries' | 'quotes' | 'bookings' | 'services' | 'comparison' | 'fullExperience' | 'ai' | 'projects' | 'media' | 'profile' | 'content' | 'texts' | 'translations' | 'notifications' | 'settings'
  path: string
  icon: IconName
  /** On the phone's bottom bar (the four used most); the rest are in "More". */
  primary: boolean
}

export const NAVIGATION: readonly NavItem[] = [
  { id: 'dashboard', path: '/', icon: 'dashboard', primary: true },
  { id: 'inquiries', path: '/inquiries', icon: 'inbox', primary: true },
  { id: 'quotes', path: '/quotes', icon: 'quote', primary: true },
  { id: 'services', path: '/services', icon: 'layers', primary: true },
  { id: 'bookings', path: '/bookings', icon: 'bell', primary: false },
  { id: 'comparison', path: '/comparison', icon: 'layers', primary: false },
  { id: 'fullExperience', path: '/full-experience', icon: 'edit', primary: false },
  { id: 'ai', path: '/ai', icon: 'info', primary: false },
  { id: 'projects', path: '/projects', icon: 'layers', primary: false },
  { id: 'media', path: '/media', icon: 'image', primary: false },
  { id: 'profile', path: '/profile', icon: 'user', primary: false },
  { id: 'content', path: '/content', icon: 'edit', primary: false },
  { id: 'texts', path: '/texts', icon: 'edit', primary: false },
  { id: 'translations', path: '/translations', icon: 'globe', primary: false },
  { id: 'notifications', path: '/notifications', icon: 'bell', primary: false },
  { id: 'settings', path: '/settings', icon: 'settings', primary: false },
]

export const navLabel = (t: AdminText, item: NavItem): string => t.nav[item.id]

/** The same place with a name short enough for the phone's bottom bar (the places that are not on it keep their name). */
export const shortNavLabel = (t: AdminText, item: NavItem): string => (item.id in t.nav.short ? t.nav.short[item.id as keyof AdminText['nav']['short']] : t.nav[item.id])
