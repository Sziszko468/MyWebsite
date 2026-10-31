/**
 * Where each letter of a sentence sits, worked out in plain numbers so it can be tested without a
 * canvas: the caller supplies a `measure` function (the width of a string in the chosen font), and
 * gets back every letter's box in a block of left-aligned lines. The same boxes are used twice:
 * to draw the sentence into a texture and to cut that texture into one quad per letter.
 *
 * Units are font pixels at `fontPx`; the scene scales them to world units.
 */

export interface Phrase {
  id: 'create' | 'break' | 'make'
  /** The sentence as set in type, one string per line. */
  lines: readonly string[]
}

/** The three sentences of the installation. They are the artwork, so they are not translated. */
export const PHRASES: readonly Phrase[] = [
  { id: 'create', lines: ['CREATE', 'WITHOUT', 'LIMITS.'] },
  { id: 'break', lines: ['BREAK', 'THE', 'PATTERN.'] },
  { id: 'make', lines: ['MAKE', 'IT', 'DIFFERENT.'] },
]

export interface LetterBox {
  char: string
  line: number
  /** Index among the sentence's letters (spaces do not count). */
  index: number
  /** The box in pixels from the block's top-left corner. */
  x: number
  y: number
  width: number
  height: number
}

export interface PhraseLayout {
  letters: LetterBox[]
  /** The block's size in pixels, margins included. */
  width: number
  height: number
  /** The most letters any phrase has: how much room to reserve. */
  fontPx: number
}

/** Height of a capital over the baseline, as a share of the font size. */
export const CAP_HEIGHT = 0.7
/** Line pitch as a share of the font size. */
export const LINE_HEIGHT = 0.9
/** Room kept around the block and around each letter, as a share of the font size. */
export const MARGIN = 0.14
export const LETTER_PAD = 0.07

/**
 * Lays a phrase out. `measure(text)` is the width of `text` in pixels at `fontPx`. A letter's
 * advance is measured as the difference between a prefix with it and without it, so kerning
 * between letters is kept exactly as the font draws it.
 */
export function layoutPhrase(
  lines: readonly string[],
  fontPx: number,
  measure: (text: string) => number,
): PhraseLayout {
  const margin = MARGIN * fontPx
  const pad = LETTER_PAD * fontPx
  const letters: LetterBox[] = []
  let widest = 0
  let index = 0

  lines.forEach((line, lineIndex) => {
    widest = Math.max(widest, measure(line))
    const top = margin + lineIndex * LINE_HEIGHT * fontPx
    const baseline = top + (LINE_HEIGHT * fontPx + CAP_HEIGHT * fontPx) / 2
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === ' ') continue
      const before = measure(line.slice(0, i))
      const advance = measure(line.slice(0, i + 1)) - before
      letters.push({
        char,
        line: lineIndex,
        index: index++,
        x: margin + before - pad,
        y: baseline - CAP_HEIGHT * fontPx - pad,
        width: advance + pad * 2,
        height: CAP_HEIGHT * fontPx + pad * 2,
      })
    }
  })

  return {
    letters,
    width: widest + margin * 2,
    height: lines.length * LINE_HEIGHT * fontPx + margin * 2,
    fontPx,
  }
}

/**
 * The font size at which the longest line of a phrase is `targetWidth` pixels wide, given the
 * width of every line measured at a reference size.
 */
export function fontSizeFor(
  lines: readonly string[],
  targetWidth: number,
  referencePx: number,
  measureAtReference: (text: string) => number,
): number {
  const widest = Math.max(...lines.map((line) => measureAtReference(line)), 1)
  return (targetWidth / widest) * referencePx
}

/** The most letters any phrase has, so buffers are sized once. */
export const MAX_LETTERS = Math.max(...PHRASES.map((phrase) => phrase.lines.join('').replace(/ /g, '').length))
