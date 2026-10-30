import { normalizeEndpoint } from '../forms/submit'

/**
 * How the contact form behaves. Everything the owner has to decide before it can send anything is
 * here, and it is separate from the quote request's (config/quote.ts) so each can go to its own
 * handler; both may be the same address, because every payload names its form (`form: 'contact'`).
 */
export interface ContactConfig {
  /**
   * Where the message is posted as JSON. Set it at build time with the environment variable
   * `VITE_CONTACT_ENDPOINT` (an https:// address of a form handler or backend that allows requests
   * from this site). While it is empty the form cannot send: it says so and offers the message to
   * copy, and it never shows a success message.
   */
  endpoint: string | null
  /**
   * Whether the visitor must tick a box acknowledging how the data is used before sending, "where
   * legally necessary". Link the privacy notice by setting its path in config/site.ts (`legal`, id
   * `privacy`). Whether a box is required is a legal decision for the owner; it is on until they decide.
   */
  requireConsent: boolean
}

export const contactConfig: ContactConfig = {
  endpoint: normalizeEndpoint(import.meta.env.VITE_CONTACT_ENDPOINT, import.meta.env.DEV),
  requireConsent: true,
}
