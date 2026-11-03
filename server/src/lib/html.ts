/**
 * The one way the admin builds HTML. Every interpolated value is escaped unless it was marked `raw` on
 * purpose (by this module's own helpers), so a name or a message a visitor typed can never become markup.
 */
export class Raw {
  readonly value: string
  constructor(value: string) {
    this.value = value
  }
  toString(): string {
    return this.value
  }
}

export const raw = (value: string): Raw => new Raw(value)

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => ESCAPES[char])

export type Part = string | number | boolean | null | undefined | Raw | readonly Part[]

function render(part: Part): string {
  if (part === null || part === undefined || part === false || part === true) return ''
  if (part instanceof Raw) return part.value
  if (Array.isArray(part)) return part.map(render).join('')
  return escapeHtml(String(part))
}

export function html(strings: TemplateStringsArray, ...values: Part[]): Raw {
  let out = strings[0]
  values.forEach((value, index) => {
    out += render(value) + strings[index + 1]
  })
  return new Raw(out)
}

export const joinHtml = (parts: readonly Part[], separator = ''): Raw => new Raw(parts.map(render).join(separator))
