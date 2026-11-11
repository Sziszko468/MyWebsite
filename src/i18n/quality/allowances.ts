import type { Allowances } from './rules'

/**
 * What the machine checks may let through, each with the reason. Like the spelling list (allowedWords.ts), an entry here is
 * a decision somebody made after reading the text; nothing is added to make a run pass.
 */

/** Texts that are the same in all three languages on purpose. Matched against the English text. */
const SAME_ON_PURPOSE: RegExp[] = [
  // A name or a technology on its own, or a short list of them ("React, TypeScript, Vite").
  /^[A-Z0-9][\w .&+/#,:()’-]*$/,
  // The technical labels of an architecture diagram: tokens joined by a middle dot ("React 19 · TypeScript · Vite",
  // "routers · services · repositories", "/api/send-email · /api/email-status"). They name parts of the code and stay English.
  /^[\w./:@+#-]+(?: [\w./:@+#-]+)* · [\w./:@+# ·-]+$/,
  // The title of a project is its name.
  /^Hollandia Kezdőknek$/,
]

/** Entries whose numbers are written differently per language on purpose (none yet). */
const NUMBERS_MAY_DIFFER: RegExp[] = []

export const allowances: Allowances = {
  sameOnPurpose: (_entry, text) => SAME_ON_PURPOSE.some((pattern) => pattern.test(text.trim())),
  numbersMayDiffer: (entry) => NUMBERS_MAY_DIFFER.some((pattern) => pattern.test(entry.id)),
}
