import type { Config } from '../config.ts'
import type { Area } from './router.ts'

/**
 * Headers every response carries, by area. The JSON API gets a policy that allows nothing to load (it returns
 * data, not documents); the admin allows only its own stylesheet, no script at all, and no framing. Anything that
 * may hold personal data is `no-store`, so no cache keeps it.
 */
export function securityHeaders(area: Area, config: Config): Record<string, string> {
  const base: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  }
  if (config.env === 'production') base['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
  if (area === 'admin') {
    return {
      ...base,
      'Content-Security-Policy': "default-src 'none'; style-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    }
  }
  if (area === 'api') {
    return { ...base, 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Cache-Control': 'no-store' }
  }
  return base
}

/** CORS for the public API: exact origins only, the two methods the API uses, no credentials, no wildcard. */
export function corsHeaders(origin: string | null, config: Config): Record<string, string> | null {
  if (!origin || !config.corsOrigins.includes(origin)) return null
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
}

export const PREFLIGHT_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, If-None-Match, X-AI-Session',
  'Access-Control-Max-Age': '600',
}
