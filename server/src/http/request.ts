import type { IncomingMessage } from 'node:http'
import { badJson, HttpError, tooLarge, unsupportedMedia } from './errors.ts'
import { isRecord } from '../lib/text.ts'

/** Reads the body in pieces and stops the moment it is larger than the limit, so a huge upload never sits in memory. */
export async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'])
  if (Number.isFinite(declared) && declared > limit) throw tooLarge(limit)
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length
    if (size > limit) {
      req.destroy()
      throw tooLarge(limit)
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

const mediaType = (req: IncomingMessage): string => (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()

/** The JSON body of a request: it must be declared as JSON and be an object, never an array or a bare value. */
export async function readJson(req: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  if (mediaType(req) !== 'application/json') throw unsupportedMedia('application/json')
  const buffer = await readBody(req, limit)
  if (buffer.length === 0) throw badJson('The request body is empty.')
  let value: unknown
  try {
    value = JSON.parse(buffer.toString('utf8'))
  } catch {
    throw badJson()
  }
  if (!isRecord(value)) throw badJson('The request body must be a JSON object.')
  return value
}

/** An HTML form's body (the admin). */
export async function readForm(req: IncomingMessage, limit: number): Promise<URLSearchParams> {
  if (mediaType(req) !== 'application/x-www-form-urlencoded') throw unsupportedMedia('application/x-www-form-urlencoded')
  const buffer = await readBody(req, limit)
  return new URLSearchParams(buffer.toString('utf8'))
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header) return out
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    const name = part.slice(0, index).trim()
    const value = part.slice(index + 1).trim()
    if (name && !(name in out)) out[name] = value
  }
  return out
}

/**
 * The address of the client. Behind a reverse proxy the socket's address is the proxy's, so the real one is
 * the entry `trustProxy` places from the right in `X-Forwarded-For` (the proxies append, and only the entries
 * they added can be trusted). With no proxy configured the header is ignored: anyone can send it.
 */
export function clientIp(req: IncomingMessage, trustProxy: number): string {
  const socket = req.socket.remoteAddress ?? 'unknown'
  let ip = socket
  if (trustProxy > 0) {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    const picked = forwarded[forwarded.length - trustProxy]
    if (picked) ip = picked
  }
  return ip.replace(/^::ffff:/, '')
}

export function requireMethodBody(method: string): boolean {
  return method === 'POST' || method === 'PATCH' || method === 'PUT'
}

export { HttpError }
