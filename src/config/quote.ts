import { normalizeEndpoint } from '../forms/submit'
import { apiEndpoint } from './api'

/**
 * How the quote request form behaves. Everything the owner has to decide before the form can send
 * anything is here.
 */
export interface QuoteConfig {
  /**
   * Where the request is posted as JSON. Set it at build time with the environment variable
   * `VITE_QUOTE_ENDPOINT` (an https:// address of a form handler or backend that allows requests
   * from this site), or by `VITE_API_URL` (the backend in server/, config/api.ts). While it is empty the form cannot send: it says so and offers the summary to
   * copy, and it never shows a success message.
   */
  endpoint: string | null
  /**
   * Whether the visitor must tick a box acknowledging how the data is used before sending. Link the
   * privacy notice by setting its path in config/site.ts (`legal`, id `privacy`). Whether a box is
   * required is a legal decision for the owner; it is on until they decide.
   */
  requireConsent: boolean
}

export const quoteConfig: QuoteConfig = {
  endpoint: normalizeEndpoint(import.meta.env.VITE_QUOTE_ENDPOINT, import.meta.env.DEV) ?? apiEndpoint('/api/quote-requests'),
  requireConsent: true,
}
