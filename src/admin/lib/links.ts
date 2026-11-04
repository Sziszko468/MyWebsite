/**
 * `mailto:` for writing to someone who wrote to the site: their real address (what they typed in the form), a subject
 * that refers to what they sent. Nothing is sent by the application: this only opens the administrator's own mail program.
 */
export function mailtoLink(address: string, subject: string, reference: string): string {
  const clean = (value: string) => value.replace(/[\r\n]+/g, ' ').trim()
  const encoded = encodeURIComponent(`Re: ${clean(subject)} (${clean(reference)})`).replace(/%20/g, '%20')
  return `mailto:${encodeURIComponent(clean(address)).replace(/%40/g, '@')}?subject=${encoded}`
}

/** The need, as the website's request builder names it, for a short line. */
export const summaryOf = (items: { need: string; plan: string }[] | undefined, label: (need: string, plan: string) => string): string => (items ?? []).map((item) => label(item.need, item.plan)).join(', ')
