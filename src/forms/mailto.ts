/** A mailto: link that opens the visitor's own e-mail program with the text ready. Nothing is sent by it. */
export function mailtoHref(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
