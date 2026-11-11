import type { Language } from '../config'

/** One customer-facing text with its three versions, found anywhere in the website's content. */
export interface TextEntry {
  /** Stable address of the text: `<file>#<export>.<path>`, e.g. `content/shop/common.ts#common.nav.label`. */
  id: string
  /** The file it was found in, relative to `src/`. */
  source: string
  /** What part of the site it belongs to (shop, services, quotes, ai, privacy, about, lab, projects, common, other). */
  area: string
  /** `undefined` when the language is absent from the entry: that is a finding, not an exception. */
  texts: Record<Language, string | undefined>
}

export type Severity = 'error' | 'warning'

export interface Finding {
  /** Short rule name, the same in the report and in the allow-lists. */
  rule: string
  severity: Severity
  /** The entry's id, or a file path for findings about source files. */
  id: string
  lang?: Language
  message: string
  /** The text (or the part of it) that raised the finding. */
  sample?: string
}

export interface Inventory {
  entries: TextEntry[]
  /** Findings about the structure itself (an entry with one or two of the three languages, a module that did not load). */
  findings: Finding[]
  /** The files that were read, relative to `src/`. */
  sources: string[]
}
