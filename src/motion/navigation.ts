/**
 * The small decisions of a navigation's choreography, as plain functions so they are tested alone: which page an address is, how a page arrives, and whether a click
 * on a link is one the router will follow in this tab.
 */

/**
 * The page a language-free address names, for everything that asks "is this another page?". A directly loaded page arrives at its address with a final slash
 * (`/en/about/`: the server's folder form), the website's own links go to the same page without one: both are the same page.
 */
export const pageKeyOf = (rest: string): string => rest.replace(/\/+$/, '') || '/'

/** The history entry a visit starts on is the one with the router's default key: there is nothing to arrive from. Back and Forward are returns. */
export function arrivalOf(navigation: 'POP' | 'PUSH' | 'REPLACE', historyKey: string): { startPage: boolean; returning: boolean } {
  return { startPage: navigation === 'POP' && historyKey === 'default', returning: navigation === 'POP' }
}

/** A plain left click that the router will follow in this tab (a new tab or window leaves this page where it is). */
export function followsHere(event: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; defaultPrevented: boolean }): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.defaultPrevented
}
