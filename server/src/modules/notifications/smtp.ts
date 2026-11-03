import net from 'node:net'
import tls from 'node:tls'
import { hostname } from 'node:os'
import type { SmtpConfig } from '../../config.ts'
import { redactText } from '../../lib/logger.ts'
import { assertSingleLine, buildMime, splitSender, type MailMessage } from './mime.ts'

/**
 * A small SMTP client: enough of RFC 5321 to hand one message to a submission server, and nothing more. It speaks
 * implicit TLS (port 465) or STARTTLS (587) and refuses to send credentials in clear text; it authenticates with
 * AUTH PLAIN or LOGIN. A reply of 4xx, a dropped connection or a timeout is `transient` (the outbox tries again
 * later); a 5xx is permanent. The strongest thing it ever reports is that the server **accepted** the message (a
 * 250 after the data): that is not delivery, and nothing in the system calls it delivery.
 */

export class MailError extends Error {
  readonly transient: boolean
  readonly code: number | null
  constructor(message: string, options: { transient: boolean; code?: number | null }) {
    super(redactText(message))
    this.name = 'MailError'
    this.transient = options.transient
    this.code = options.code ?? null
  }
}

interface Reply {
  code: number
  lines: string[]
}

class Connection {
  private socket: net.Socket | tls.TLSSocket
  private buffer = ''
  private pending: string[] = []
  private waiter: ((value: Reply | Error) => void) | null = null
  private failure: Error | null = null
  private readonly timeoutMs: number

  constructor(socket: net.Socket | tls.TLSSocket, timeoutMs: number) {
    this.socket = socket
    this.timeoutMs = timeoutMs
    this.attach(socket)
  }

  private attach(socket: net.Socket | tls.TLSSocket): void {
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      this.buffer += chunk
      let index: number
      while ((index = this.buffer.indexOf('\r\n')) >= 0) {
        this.pending.push(this.buffer.slice(0, index))
        this.buffer = this.buffer.slice(index + 2)
      }
      this.flush()
    })
    const fail = (error: Error) => {
      this.failure = error
      this.flush()
    }
    socket.on('error', fail)
    socket.on('close', () => fail(new MailError('The connection to the mail server closed unexpectedly.', { transient: true })))
  }

  /** Delivers the next complete reply (possibly several lines: `250-…` until `250 …`) to whoever is waiting. */
  private flush(): void {
    if (!this.waiter) return
    const lines: string[] = []
    for (let i = 0; i < this.pending.length; i += 1) {
      lines.push(this.pending[i])
      if (/^\d{3} /.test(this.pending[i]) || /^\d{3}$/.test(this.pending[i])) {
        const waiter = this.waiter
        this.waiter = null
        this.pending.splice(0, i + 1)
        waiter({ code: Number(lines[0].slice(0, 3)), lines })
        return
      }
    }
    if (this.failure) {
      const waiter = this.waiter
      this.waiter = null
      waiter(this.failure)
    }
  }

  reply(): Promise<Reply> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null
        this.socket.destroy()
        reject(new MailError('The mail server did not answer in time.', { transient: true }))
      }, this.timeoutMs)
      this.waiter = (value) => {
        clearTimeout(timer)
        if (value instanceof Error) reject(value instanceof MailError ? value : new MailError(value.message, { transient: true }))
        else resolve(value)
      }
      this.flush()
    })
  }

  async command(line: string | null, ok: readonly number[]): Promise<Reply> {
    if (line !== null) this.socket.write(`${line}\r\n`)
    const reply = await this.reply()
    if (!ok.includes(reply.code)) {
      throw new MailError(`The mail server answered ${reply.lines[reply.lines.length - 1] ?? reply.code}`, { transient: reply.code >= 400 && reply.code < 500, code: reply.code })
    }
    return reply
  }

  write(data: string): void {
    this.socket.write(data)
  }

  /** Replaces the socket with a TLS one over it (STARTTLS). */
  upgrade(options: tls.ConnectionOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const old = this.socket
      old.removeAllListeners('data')
      old.removeAllListeners('close')
      old.removeAllListeners('error')
      this.buffer = ''
      this.pending = []
      this.failure = null
      const secured = tls.connect({ ...options, socket: old as net.Socket })
      secured.once('secureConnect', () => {
        this.socket = secured
        this.attach(secured)
        resolve()
      })
      secured.once('error', (error) => reject(new MailError(`TLS to the mail server failed: ${error.message}`, { transient: true })))
    })
  }

  close(): void {
    this.socket.destroy()
  }
}

function open(config: SmtpConfig): Promise<net.Socket | tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(new MailError(`Could not connect to the mail server: ${error.message}`, { transient: true }))
    const timer = setTimeout(() => reject(new MailError('Connecting to the mail server timed out.', { transient: true })), config.timeoutMs)
    const done = <T extends net.Socket>(socket: T) => {
      clearTimeout(timer)
      socket.removeListener('error', onError)
      resolve(socket)
    }
    if (config.secure === 'tls') {
      const socket = tls.connect({ host: config.host, port: config.port, servername: config.host, rejectUnauthorized: config.rejectUnauthorized })
      socket.once('secureConnect', () => done(socket))
      socket.once('error', onError)
    } else {
      const socket = net.connect({ host: config.host, port: config.port })
      socket.once('connect', () => done(socket))
      socket.once('error', onError)
    }
  })
}

export interface SmtpResult {
  /** The server's last line after the data: usually carries its queue id. */
  response: string
}

export async function sendSmtp(config: SmtpConfig, message: MailMessage): Promise<SmtpResult> {
  const from = splitSender(message.from).address
  const to = splitSender(message.to).address
  assertSingleLine(from, 'The sender')
  assertSingleLine(to, 'The recipient')
  const data = buildMime(message)

  const socket = await open(config)
  const connection = new Connection(socket, config.timeoutMs)
  const tlsOptions = { servername: config.host, rejectUnauthorized: config.rejectUnauthorized }
  try {
    await connection.command(null, [220])
    const client = hostname().replace(/[^A-Za-z0-9.-]/g, '') || 'localhost'
    let hello = await connection.command(`EHLO ${client}`, [250])
    if (config.secure === 'starttls') {
      if (!hello.lines.some((line) => /STARTTLS/i.test(line))) throw new MailError('The mail server does not offer STARTTLS.', { transient: false })
      await connection.command('STARTTLS', [220])
      await connection.upgrade(tlsOptions)
      hello = await connection.command(`EHLO ${client}`, [250])
    }
    if (config.user !== null && config.password !== null) {
      const advertised = hello.lines.find((line) => /AUTH/i.test(line)) ?? ''
      if (/\bPLAIN\b/i.test(advertised)) {
        await connection.command(`AUTH PLAIN ${Buffer.from(`\0${config.user}\0${config.password}`).toString('base64')}`, [235])
      } else if (/\bLOGIN\b/i.test(advertised)) {
        await connection.command('AUTH LOGIN', [334])
        await connection.command(Buffer.from(config.user).toString('base64'), [334])
        await connection.command(Buffer.from(config.password).toString('base64'), [235])
      } else {
        throw new MailError('The mail server offers no supported way to sign in (PLAIN or LOGIN).', { transient: false })
      }
    }
    await connection.command(`MAIL FROM:<${from}>`, [250])
    await connection.command(`RCPT TO:<${to}>`, [250, 251])
    await connection.command('DATA', [354])
    // Dot-stuffing: a line that starts with a dot would end the data early.
    connection.write(`${data.replace(/\r\n\./g, '\r\n..')}\r\n.\r\n`)
    const accepted = await connection.command(null, [250])
    try {
      await connection.command('QUIT', [221])
    } catch {
      // The message was accepted; how the conversation ends does not matter.
    }
    return { response: accepted.lines[accepted.lines.length - 1] ?? '' }
  } catch (error) {
    throw error instanceof MailError ? error : new MailError(error instanceof Error ? error.message : String(error), { transient: true })
  } finally {
    connection.close()
  }
}
