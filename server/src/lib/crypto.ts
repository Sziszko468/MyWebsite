import { createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto'

export const newId = (): string => randomUUID()

/** Crockford's alphabet: no 0/O or 1/I/L, so a reference read aloud or typed from a letter survives. */
const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'

/** A short code shown to a visitor (`Q-7K3M9XQH`). Not secret and not sequential; uniqueness is the database's job. */
export function newReference(prefix: string): string {
  const bytes = randomBytes(8)
  let code = ''
  for (const byte of bytes) code += REFERENCE_ALPHABET[byte % REFERENCE_ALPHABET.length]
  return `${prefix}-${code}`
}

export const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex')

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url')

/** A keyed hash, so a stored value (a network address) can be compared and counted but not read back. */
export function hmacHex(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex').slice(0, 32)
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

// ---- passwords -----------------------------------------------------------------------------------------------------

const SCRYPT = { N: 32768, r: 8, p: 1, keyLength: 64, maxmem: 64 * 1024 * 1024 } as const

function derive(password: string, salt: Buffer, params: { N: number; r: number; p: number; keyLength: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, params.keyLength, { N: params.N, r: params.r, p: params.p, maxmem: SCRYPT.maxmem }, (error, key) =>
      error ? reject(error) : resolve(key),
    )
  })
}

/** `scrypt$N$r$p$salt$hash` (base64url): the parameters travel with the hash, so they can be raised later without a migration. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, SCRYPT)
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64url'), key.toString('base64url')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, hash] = stored.split('$')
  if (kind !== 'scrypt' || !n || !r || !p || !salt || !hash) return false
  const expected = Buffer.from(hash, 'base64url')
  try {
    const key = await derive(password, Buffer.from(salt, 'base64url'), { N: Number(n), r: Number(r), p: Number(p), keyLength: expected.length })
    return key.length === expected.length && timingSafeEqual(key, expected)
  } catch {
    return false
  }
}

/** A hash to compare against when the account does not exist, so a missing account costs the same time as a wrong password. */
export const DUMMY_HASH = 'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$' + Buffer.alloc(64).toString('base64url')
