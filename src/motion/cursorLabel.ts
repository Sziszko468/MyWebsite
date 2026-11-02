/**
 * The rules of the contextual cursor label, as plain functions so they are tested without a browser.
 *
 * The label is an addition to the pointer, not a replacement: the native cursor is never hidden, the
 * label takes no input, and it shows only where it adds something (over a card or a picture that says
 * what a click does), only for a mouse, and never over a text field, a selection or a pressed button.
 */

/** Elements over which the label stays away: anything the visitor types in, selects in or drags. */
export const NO_LABEL_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [data-no-cursor]'

/** The label's offset from the pointer, in px: just below and to the right, clear of the native cursor. */
export const LABEL_OFFSET = { x: 16, y: 18 }

/** Keeps the label inside the viewport: it flips to the left of / above the pointer near the right and bottom edges. */
export function placeLabel(pointer: { x: number; y: number }, size: { width: number; height: number }, viewport: { width: number; height: number }): { x: number; y: number } {
  let x = pointer.x + LABEL_OFFSET.x
  let y = pointer.y + LABEL_OFFSET.y
  if (x + size.width > viewport.width - 8) x = pointer.x - LABEL_OFFSET.x - size.width
  if (y + size.height > viewport.height - 8) y = pointer.y - LABEL_OFFSET.y - size.height
  return { x: Math.max(8, Math.round(x)), y: Math.max(8, Math.round(y)) }
}

/** The text to show for an element, or `null` for none: the nearest ancestor that asks for one. */
export function labelFor(target: Element | null): string | null {
  if (!target) return null
  if (target.closest(NO_LABEL_SELECTOR)) return null
  const text = target.closest<HTMLElement>('[data-cursor]')?.dataset.cursor?.trim()
  return text ? text : null
}
