import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Optional encryption of a backup before it leaves the server (`BACKUP_ENCRYPTION_KEY`): AES-256-GCM, one random nonce per file,
 * nothing else. A backed-up file is
 *
 *     "CCBK1" | key id (4 bytes) | nonce (12 bytes) | ciphertext | GCM tag (16 bytes)
 *
 * The header (magic, key id, nonce) is authenticated as additional data, so a changed header is refused like a changed byte of the
 * file. The key id is the first four bytes of the key's SHA-256: it tells a wrong key from a damaged file, and says which key to look
 * for after a rotation, without telling anything about the key. The key itself is 32 random bytes the owner keeps outside the
 * server's backups (a password manager): without it an encrypted backup cannot be read, by anyone, including this program.
 *
 * Decrypting by hand (the documented command): `node server/src/cli.ts backup decrypt <file.enc> <output>` with the key in the
 * environment; docs/operations/BACKUPS.md.
 */

export const BACKUP_MAGIC = Buffer.from('CCBK1', 'latin1')
const KEY_ID_BYTES = 4
const NONCE_BYTES = 12
const TAG_BYTES = 16
const HEADER_BYTES = BACKUP_MAGIC.length + KEY_ID_BYTES + NONCE_BYTES

export type BackupCryptoFailure = 'not_encrypted' | 'wrong_key' | 'corrupt'

const MESSAGES: Record<BackupCryptoFailure, string> = {
  not_encrypted: 'This file is not an encrypted backup.',
  wrong_key: 'This backup was encrypted with a different key.',
  corrupt: 'The encrypted backup is damaged or has been changed: it cannot be authenticated.',
}

/** The only error of this file: a fixed sentence, never a byte of the file or of the key. */
export class BackupCryptoError extends Error {
  readonly reason: BackupCryptoFailure
  constructor(reason: BackupCryptoFailure) {
    super(MESSAGES[reason])
    this.name = 'BackupCryptoError'
    this.reason = reason
  }
}

/**
 * The key from its written form: 32 random bytes as base64 (`openssl rand -base64 32`) or as 64 hexadecimal characters. Returns null
 * for anything else, and for a key that cannot be random (all bytes the same).
 */
export function parseBackupKey(value: string): Buffer | null {
  const text = value.trim()
  let bytes: Buffer | null = null
  if (/^[0-9a-fA-F]{64}$/.test(text)) bytes = Buffer.from(text, 'hex')
  else if (/^[A-Za-z0-9+/_-]{43}=?$/.test(text)) bytes = Buffer.from(text, 'base64')
  if (!bytes || bytes.length !== 32) return null
  return bytes.every((byte) => byte === bytes[0]) ? null : bytes
}

/** A short public identifier of a key (8 hexadecimal characters): enough to tell two keys apart, nothing more. */
export const keyIdOf = (key: Buffer): string => createHash('sha256').update(key).digest().subarray(0, KEY_ID_BYTES).toString('hex')

export function isEncryptedBackup(data: Uint8Array): boolean {
  return data.byteLength >= HEADER_BYTES + TAG_BYTES && Buffer.from(data.buffer, data.byteOffset, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)
}

export function encryptBackup(key: Buffer, plaintext: Uint8Array): Buffer {
  const nonce = randomBytes(NONCE_BYTES)
  const header = Buffer.concat([BACKUP_MAGIC, Buffer.from(keyIdOf(key), 'hex'), nonce])
  const cipher = createCipheriv('aes-256-gcm', key, nonce)
  cipher.setAAD(header)
  return Buffer.concat([header, cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])
}

export function decryptBackup(key: Buffer, data: Uint8Array): Buffer {
  if (!isEncryptedBackup(data)) throw new BackupCryptoError('not_encrypted')
  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  const header = bytes.subarray(0, HEADER_BYTES)
  const id = header.subarray(BACKUP_MAGIC.length, BACKUP_MAGIC.length + KEY_ID_BYTES)
  const expected = Buffer.from(keyIdOf(key), 'hex')
  if (!timingSafeEqual(id, expected)) throw new BackupCryptoError('wrong_key')
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(BACKUP_MAGIC.length + KEY_ID_BYTES))
    decipher.setAAD(header)
    decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES))
    return Buffer.concat([decipher.update(bytes.subarray(HEADER_BYTES, bytes.length - TAG_BYTES)), decipher.final()])
  } catch {
    throw new BackupCryptoError('corrupt')
  }
}
