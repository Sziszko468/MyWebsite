/**
 * Splitting a headline for kinetic type, as plain functions so the rules are tested without a
 * browser. The text always stays real text in reading order; this only decides where the boxes are.
 */

/** The longest text that may move letter by letter. Longer text falls back to words: a letter-by-letter paragraph is noise. */
export const MAX_CHARS = 28

export type KineticVariant = 'words' | 'mask' | 'chars'

/** A word is whatever lies between spaces; empty pieces (a doubled or trailing space) are dropped. */
export function splitWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean)
}

/**
 * A word cut after each hyphen or dash, so every piece can be its own box and the line may still
 * break there, as it does in plain text ("Webalkalmazás-" / "fejlesztés"). A word without one is
 * a single piece.
 */
export function splitParts(word: string): string[] {
  // The hyphen-minus, the hyphen (U+2010), the non-breaking hyphen (U+2011), the en dash and the em dash.
  return word.match(/[^-‐‑–—]+[-‐‑–—]*|[-‐‑–—]+/g) ?? [word]
}

/** The letters of a piece as a reader sees them: an accented letter, an emoji or a ligature stays whole. */
export function splitGraphemes(text: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: 'grapheme' }) => { segment(text: string): Iterable<{ segment: string }> } }).Segmenter
  if (Segmenter) return [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((item) => item.segment)
  return Array.from(text)
}

/** `chars` is for short headlines only; anything longer moves by word. */
export function resolveVariant(variant: KineticVariant, text: string): KineticVariant {
  return variant === 'chars' && [...text].length > MAX_CHARS ? 'mask' : variant
}
