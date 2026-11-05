/**
 * Structured logs: one JSON object per line on stdout, for whatever collects them. Fields named like a
 * secret or like personal data are replaced before anything is written, so a careless call cannot put a
 * password, a token, a cookie or an e-mail address into the logs. Request and message bodies are never logged.
 */
export type Level = 'debug' | 'info' | 'warn' | 'error'
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }

const SENSITIVE = /pass(word)?|secret|token|cookie|authorization|auth|email|e-mail|phone|name|message|body|subject|description|requirements|csrf|session|credential/i

/**
 * The configured secrets (an API key, a signing secret, a password), registered once at start-up. Whatever text is masked
 * afterwards has them removed first, wherever it came from: a provider's error message that quotes the key it was
 * given, a library's exception. A secret too short to be one is ignored (masking "ab" everywhere would be noise).
 */
const SECRETS = new Set<string>()
export function registerSecret(value: string | null | undefined): void {
  if (value && value.length >= 8) SECRETS.add(value)
}

/** Messages that may quote what the database or the mail server said: secrets, addresses and long tokens are masked. */
export function redactText(text: string): string {
  let clean = text
  for (const secret of SECRETS) clean = clean.split(secret).join('[secret]')
  return clean
    .replace(/[^\s@<>()"']+@[^\s@<>()"']+\.[^\s@<>()"']+/g, '[address]')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[token]')
    .slice(0, 500)
}

function scrub(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return { name: value.name, message: redactText(value.message) }
  if (Array.isArray(value)) return depth > 3 ? '[…]' : value.slice(0, 20).map((item) => scrub(item, depth + 1))
  if (typeof value === 'object' && value !== null) {
    if (depth > 3) return '[…]'
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) out[key] = SENSITIVE.test(key) ? '[redacted]' : scrub(item, depth + 1)
    return out
  }
  if (typeof value === 'string') return redactText(value)
  return value
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void
  info(message: string, fields?: Record<string, unknown>): void
  warn(message: string, fields?: Record<string, unknown>): void
  error(message: string, fields?: Record<string, unknown>): void
  child(fields: Record<string, unknown>): Logger
}

export function createLogger(options: { level: Level; write?: (line: string) => void; base?: Record<string, unknown> }): Logger {
  const write = options.write ?? ((line: string) => void process.stdout.write(line + '\n'))
  const make = (base: Record<string, unknown>): Logger => {
    const log = (level: Level, message: string, fields?: Record<string, unknown>) => {
      if (ORDER[level] < ORDER[options.level]) return
      const entry = { time: new Date().toISOString(), level, msg: message, ...(scrub({ ...base, ...fields }) as object) }
      write(JSON.stringify(entry))
    }
    return {
      debug: (m, f) => log('debug', m, f),
      info: (m, f) => log('info', m, f),
      warn: (m, f) => log('warn', m, f),
      error: (m, f) => log('error', m, f),
      child: (fields) => make({ ...base, ...fields }),
    }
  }
  return make(options.base ?? {})
}

export const silentLogger: Logger = createLogger({ level: 'error', write: () => undefined })
