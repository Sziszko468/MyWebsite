import { normalizeEndpoint } from '../forms/submit'

/**
 * Where the backend (server/) is. One variable, `VITE_API_URL`, at build time:
 *   - `https://api.example.com`  the backend's origin (a local http:// address works while developing);
 *   - `/`                        the backend serves this website too (STATIC_DIR), so the API is on the same origin;
 *   - not set                    there is no backend: the forms say they cannot send and never claim success.
 * `VITE_CONTACT_ENDPOINT` and `VITE_QUOTE_ENDPOINT` still win when set (a form handler of another kind), and
 * the analytics endpoint is its own variable. The API's paths are the server's (docs/backend/README.md).
 */
export function apiBase(value: unknown, allowLocalHttp = false): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  if (value.trim() === '/') return ''
  const origin = normalizeEndpoint(value.trim().replace(/\/+$/, '') + '/', allowLocalHttp)
  return origin ? origin.replace(/\/+$/, '') : null
}

export const API_BASE: string | null = apiBase(import.meta.env.VITE_API_URL, import.meta.env.DEV)

/** The address of one API path, or `null` when no backend is configured. */
export const apiEndpoint = (path: string, base: string | null = API_BASE): string | null => (base === null ? null : `${base}${path}`)
