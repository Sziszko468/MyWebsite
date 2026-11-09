import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import tls from 'node:tls'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SmtpConfig } from '../src/config.ts'
import { createMailer } from '../src/modules/notifications/mailer.ts'
import { assertSingleLine, buildMime, encodeWords, formatAddress, MimeError, splitSender, type MailMessage } from '../src/modules/notifications/mime.ts'
import { MailError, sendSmtp } from '../src/modules/notifications/smtp.ts'
import { renderRequestNotification } from '../src/modules/notifications/quoteTemplates.ts'
import { renderInquiryReceived, renderStatusChange } from '../src/modules/notifications/templates.ts'
import { contact, quote, startServer, type TestServer } from './helpers.ts'

// ---- helpers -------------------------------------------------------------------------------------------------------------

const message = (overrides: Partial<MailMessage> = {}): MailMessage => ({
  from: 'Test Brand <no-reply@site.test>',
  to: 'anna@example.com',
  replyTo: null,
  subject: 'A subject',
  text: 'Plain body.',
  html: '<p>Html body.</p>',
  messageId: 'abc123@site.test',
  date: new Date('2026-11-03T10:00:00.000Z'),
  ...overrides,
})

/** The text of a MIME part, decoded. */
function parts(mime: string): { headers: string; text: string; html: string } {
  const [headers] = mime.split('\r\n\r\n')
  const decode = (type: string) => {
    const match = new RegExp(`Content-Type: ${type}; charset=utf-8\\r\\nContent-Transfer-Encoding: base64\\r\\n\\r\\n([A-Za-z0-9+/=\\r\\n]*?)\\r\\n--`).exec(mime)
    return match ? Buffer.from(match[1].replace(/\r\n/g, ''), 'base64').toString('utf8') : ''
  }
  return { headers, text: decode('text/plain'), html: decode('text/html') }
}

const row = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'id-1', reference: 'C-ABCD2345', language: 'en', kind: 'project', name: 'Anna Kovács', email: 'anna@example.com', subject: 'A new website',
    message: 'I would like a small website.', status: 'new', archived_at: null, consent_at: '2026-11-03T10:00:00.000Z', ip_hash: 'x', content_hash: 'y',
    request_type: 'package_quote', source: 'shop', company: null, website: null, budget_range: null,
    created_at: '2026-11-03T10:00:00.000Z', updated_at: '2026-11-03T10:00:00.000Z', ...overrides,
  }) as never

// ---- templates -------------------------------------------------------------------------------------------------------------

describe('the e-mail templates', () => {
  const hostile = row({ name: '<script>alert(1)</script>', subject: 'Hello\r\nBcc: evil@example.com', message: 'Line one\n<img src=x onerror=alert(2)> & "quoted"' })

  it('exist in all three languages, with the brand, and speak the language of the recipient', () => {
    const subjects = (['hu', 'en', 'nl'] as const).map((lang) => renderInquiryReceived(row(), lang, 'Test Brand').subject)
    expect(new Set(subjects).size).toBe(3)
    expect(subjects[0]).toMatch(/^Új üzenet \(C-ABCD2345\)/)
    expect(subjects[1]).toMatch(/^New message \(C-ABCD2345\)/)
    expect(subjects[2]).toMatch(/^Nieuw bericht \(C-ABCD2345\)/)
    for (const lang of ['hu', 'en', 'nl'] as const) {
      const rendered = renderInquiryReceived(row(), lang, 'Test Brand')
      expect(rendered.html).toContain(`<html lang="${lang}">`)
      expect(rendered.html).toContain('Test Brand')
      expect(rendered.text).toContain('TEST BRAND')
      expect(rendered.text).toContain('C-ABCD2345')
      expect(rendered.html).toContain('#ff161f') // the site's red
    }
  })

  it('never lets what a visitor typed become markup, and never puts a line break in a subject', () => {
    const rendered = renderInquiryReceived(hostile, 'en', 'Test Brand')
    expect(rendered.html).not.toMatch(/<script>|<img src=x/)
    expect(rendered.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(rendered.html).toContain('&lt;img src=x onerror=alert(2)&gt; &amp; &quot;quoted&quot;')
    expect(rendered.subject).not.toMatch(/[\r\n]/)
    expect(rendered.text).toContain('<script>alert(1)</script>') // the plain part is text; nothing interprets it
  })

  it('describes a quote request with its parts and the pricing it can state, and says nothing about a price it does not have', () => {
    const items = [{ id: 1, position: 0, need: 'website', package: 'launch', extras: ['pages'], snapshot: { plan: null, extras: [] } }] as never
    const none = renderRequestNotification({ request: row({ reference: 'Q-ABCD2345', description: 'A bakery site.', objective: 'present', timing: 'months', requirements: null, reference_notes: null, phone: null }), items, totals: { fixed: [], quotedParts: 2 }, packageName: () => 'Launch' }, 'en', 'Test Brand', null)
    expect(none.text).toContain('Launch')
    expect(none.text).toContain('pages')
    expect(none.text).not.toMatch(/\d+ (EUR|HUF)/)
    const some = renderRequestNotification({ request: row({ reference: 'Q-ABCD2345', description: 'A bakery site.', objective: null, timing: null, requirements: null, reference_notes: null, phone: '+31 6 1234 5678' }), items, totals: { fixed: [{ currency: 'EUR', amount: 900, vat: 'excluded' }], quotedParts: 1 }, packageName: () => 'Launch' }, 'en', 'Test Brand', null)
    expect(some.text).toMatch(/900 EUR/)
    expect(some.text).toContain('+31 6 1234 5678')
  })

  it('tells the customer a status, in their language, with the note an administrator wrote, and never claims a delivery', () => {
    const quoteRow = { reference: 'Q-ABCD2345', name: 'Anna Kovács', status: 'quote_sent', language: 'nl' as const }
    const dutch = renderStatusChange('quote', quoteRow, 'Het voorstel zit in de bijlage.', 'nl', 'Test Brand')
    expect(dutch.subject).toContain('Q-ABCD2345')
    expect(dutch.text).toContain('Het voorstel zit in de bijlage.')
    expect(dutch.html).toContain('Anna')
    const hungarian = renderStatusChange('inquiry', { reference: 'C-ABCD2345', name: 'Anna', status: 'answered', language: 'hu' }, null, 'hu', 'Test Brand')
    expect(hungarian.html).toContain('lang="hu"')
    expect(hungarian.html).not.toContain('border-left:4px solid') // no note, no note box
    for (const lang of ['hu', 'en', 'nl'] as const) {
      const text = renderStatusChange('inquiry', { reference: 'C-ABCD2345', name: 'Anna', status: 'closed', language: lang }, null, lang, 'Test Brand').text
      expect(text).not.toMatch(/delivered|kézbesít|bezorgd/i)
    }
    const injected = renderStatusChange('inquiry', { reference: 'C-ABCD2345', name: 'Anna\r\nBcc: evil@example.com', status: 'closed', language: 'en' }, '<b>x</b>', 'en', 'Test Brand')
    expect(injected.subject).not.toMatch(/[\r\n]/)
    expect(injected.html).not.toContain('<b>x</b>')
  })
})

// ---- MIME -------------------------------------------------------------------------------------------------------------------

describe('the message format', () => {
  it('is multipart/alternative with a plain and an HTML part, both UTF-8, the text intact', () => {
    const mime = buildMime(message({ text: 'Árvíztűrő tükörfúrógép — ✓', html: '<p>Árvíztűrő</p>' }))
    expect(mime).toMatch(/^Date: Tue, 03 Nov 2026 10:00:00 \+0000\r\n/)
    expect(mime).toContain('From: Test Brand <no-reply@site.test>\r\n')
    expect(mime).toContain('To: anna@example.com\r\n')
    expect(mime).toContain('Message-ID: <abc123@site.test>\r\n')
    expect(mime).toContain('MIME-Version: 1.0\r\n')
    expect(mime).toMatch(/Content-Type: multipart\/alternative; boundary="cc-[0-9a-f]{24}"/)
    const decoded = parts(mime)
    expect(decoded.text).toBe('Árvíztűrő tükörfúrógép — ✓')
    expect(decoded.html).toBe('<p>Árvíztűrő</p>')
    for (const line of mime.split('\r\n')) expect(line.length, line.slice(0, 30)).toBeLessThanOrEqual(998)
    expect(mime.split('\r\n').filter((line) => /^[A-Za-z0-9+/=]{77,}$/.test(line))).toEqual([]) // base64 folded at 76
  })

  it('encodes a non-ASCII subject or name as RFC 2047 words, each short enough, and round-trips', () => {
    const subject = 'Új üzenet: Árvíztűrő tükörfúrógép árajánlatot kér — kérem, válaszoljon!'
    const encoded = encodeWords(subject)
    expect(encoded).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=(\r\n =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=)*$/)
    const decoded = encoded.split('\r\n ').map((word) => Buffer.from(/=\?UTF-8\?B\?(.*)\?=/.exec(word)![1], 'base64').toString('utf8')).join('')
    expect(decoded).toBe(subject)
    for (const word of encoded.split('\r\n ')) expect(word.length).toBeLessThanOrEqual(75)
    expect(encodeWords('Plain ASCII')).toBe('Plain ASCII')
    expect(formatAddress('Kovács Ánna <anna@example.com>')).toMatch(/^=\?UTF-8\?B\?.+\?= <anna@example.com>$/)
    expect(formatAddress('Smith, John <john@example.com>')).toBe('"Smith, John" <john@example.com>')
    expect(formatAddress('plain@example.com')).toBe('plain@example.com')
    expect(splitSender('"Quoted Name" <a@b.example>')).toEqual({ name: 'Quoted Name', address: 'a@b.example' })
  })

  it('refuses a line break in any header value, which is how a header would be injected', () => {
    for (const override of [{ subject: 'Hello\r\nBcc: evil@example.com' }, { to: 'a@example.com\r\nBcc: evil@example.com' }, { from: 'x@site.test\nBcc: evil@example.com' }, { replyTo: 'a@example.com\rX: y' }, { messageId: 'id\r\n@site.test' }, { subject: 'nul\0byte' }]) {
      expect(() => buildMime(message(override as Partial<MailMessage>)), JSON.stringify(override)).toThrow(MimeError)
    }
    expect(() => assertSingleLine('ok', 'A value')).not.toThrow()
    expect(() => splitSender('a@example.com\r\nRCPT TO:<evil@example.com>')).toThrow(MimeError)
  })

  it('writes the file provider\'s messages as .eml files a person can open, and offers no provider when none is configured', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cc-mail-'))
    try {
      const mailer = createMailer({ provider: 'file', fileDirectory: directory } as never)!
      const result = await mailer.send(message())
      expect(result.providerMessageId).toMatch(/^2026-11-03T10-00-00-000Z-abc123\.eml$/)
      expect(readdirSync(directory)).toEqual([result.providerMessageId])
      expect(parts(readFileSync(join(directory, result.providerMessageId!), 'utf8')).text).toBe('Plain body.')
      expect(createMailer({ provider: 'none', fileDirectory: null, smtp: null } as never)).toBeNull()
      expect(createMailer({ provider: 'smtp', fileDirectory: null, smtp: null } as never)).toBeNull()
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})

// ---- a mail server to talk to ---------------------------------------------------------------------------------------------

interface MockOptions {
  /** What the server advertises for AUTH. */
  auth?: 'plain' | 'login' | 'both' | 'none'
  user?: string
  password?: string
  /** Offer STARTTLS (the certificate pair), and refuse AUTH until it has happened. */
  starttls?: { key: string; cert: string }
  /** Speak TLS from the first byte. */
  implicitTls?: { key: string; cert: string }
  /** Replace the reply to a command: `greeting`, `mail`, `rcpt`, `data`, `end`. */
  replies?: Partial<Record<'greeting' | 'mail' | 'rcpt' | 'data' | 'end', string>>
  /** Close the connection when this command arrives. */
  dropOn?: 'mail' | 'rcpt' | 'data'
  /** Accept the connection and never say a word. */
  silent?: boolean
}

interface MockServer {
  port: number
  /** Every line the client sent (credentials in AUTH lines are kept, to be checked). */
  transcript: string[]
  /** Every message body that reached the end of DATA, with dot-stuffing removed. */
  messages: string[]
  close(): Promise<void>
}

async function mockSmtp(options: MockOptions = {}, port = 0): Promise<MockServer> {
  const transcript: string[] = []
  const messages: string[] = []
  const sockets = new Set<net.Socket>()

  const handle = (socket: net.Socket, secured: boolean, greet: boolean) => {
    let buffer = ''
    let data: string | null = null
    let authStep: 'login-user' | 'login-password' | null = null
    let authUser = ''
    const say = (line: string) => socket.write(`${line}\r\n`)
    const credentialsOk = (user: string, password: string) => user === options.user && password === options.password
    const mayAuth = options.auth !== 'none' && options.auth !== undefined && (secured || !options.starttls)

    const onLine = (line: string) => {
      if (data !== null) {
        if (line === '.') {
          messages.push(data)
          data = null
          say(options.replies?.end ?? '250 2.0.0 Ok: queued as TEST123')
        } else {
          data += `${line.startsWith('..') ? line.slice(1) : line}\r\n`
        }
        return
      }
      transcript.push(line)
      if (authStep === 'login-user') {
        authUser = Buffer.from(line, 'base64').toString('utf8')
        authStep = 'login-password'
        return say('334 UGFzc3dvcmQ6')
      }
      if (authStep === 'login-password') {
        authStep = null
        return say(credentialsOk(authUser, Buffer.from(line, 'base64').toString('utf8')) ? '235 2.7.0 Authentication successful' : '535 5.7.8 Authentication credentials invalid')
      }
      const command = line.toUpperCase()
      if (command.startsWith('EHLO')) {
        const extensions = ['250-mock.test', '250-SIZE 10485760']
        if (options.starttls && !secured) extensions.push('250-STARTTLS')
        if (mayAuth) extensions.push(`250-AUTH ${options.auth === 'plain' ? 'PLAIN' : options.auth === 'login' ? 'LOGIN' : 'PLAIN LOGIN'}`)
        extensions.push('250 8BITMIME')
        return extensions.forEach(say)
      }
      if (command === 'STARTTLS' && options.starttls) {
        say('220 2.0.0 Ready to start TLS')
        socket.removeAllListeners('data')
        const upgraded = new tls.TLSSocket(socket, { isServer: true, secureContext: tls.createSecureContext(options.starttls) })
        upgraded.on('error', () => undefined)
        sockets.add(upgraded)
        handle(upgraded, true, false)
        return
      }
      if (command.startsWith('AUTH PLAIN') && mayAuth) {
        const [, user, password] = Buffer.from(line.slice(11).trim(), 'base64').toString('utf8').split('\0')
        return say(credentialsOk(user, password) ? '235 2.7.0 Authentication successful' : '535 5.7.8 Authentication credentials invalid')
      }
      if (command === 'AUTH LOGIN' && mayAuth) {
        authStep = 'login-user'
        return say('334 VXNlcm5hbWU6')
      }
      if (command.startsWith('AUTH')) return say('538 5.7.11 Encryption required for requested authentication mechanism')
      if (command.startsWith('MAIL FROM:')) {
        if (options.dropOn === 'mail') return socket.destroy()
        return say(options.replies?.mail ?? '250 2.1.0 Ok')
      }
      if (command.startsWith('RCPT TO:')) {
        if (options.dropOn === 'rcpt') return socket.destroy()
        return say(options.replies?.rcpt ?? '250 2.1.5 Ok')
      }
      if (command === 'DATA') {
        if (options.dropOn === 'data') return socket.destroy()
        const reply = options.replies?.data ?? '354 End data with <CR><LF>.<CR><LF>'
        if (reply.startsWith('354')) data = ''
        return say(reply)
      }
      if (command === 'QUIT') {
        say('221 2.0.0 Bye')
        return socket.end()
      }
      say('502 5.5.2 Command not recognized')
    }

    socket.on('error', () => undefined)
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8')
      let index: number
      while ((index = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        onLine(line)
      }
    })
    if (greet) say(options.replies?.greeting ?? '220 mock.test ESMTP ready')
  }

  const onConnection = (socket: net.Socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    if (options.silent) return
    handle(socket, options.implicitTls !== undefined, true)
  }
  const server = options.implicitTls
    ? tls.createServer({ key: options.implicitTls.key, cert: options.implicitTls.cert }, onConnection).on('tlsClientError', () => undefined)
    : net.createServer(onConnection)
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', () => resolve()))
  return {
    port: (server.address() as net.AddressInfo).port,
    transcript,
    messages,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy()
        server.close(() => resolve())
      }),
  }
}

// (10 s, not 3: the whole suite runs its files in parallel, and a TLS handshake on a starved machine took longer than 3 s once.)
const smtp = (port: number, overrides: Partial<SmtpConfig> = {}): SmtpConfig => ({ host: '127.0.0.1', port, secure: 'none', user: null, password: null, rejectUnauthorized: true, timeoutMs: 10_000, ...overrides })

/** A throw-away self-signed certificate for localhost, made with openssl when it is installed. */
function selfSigned(): { key: string; cert: string } | null {
  const directory = mkdtempSync(join(tmpdir(), 'cc-cert-'))
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(directory, 'key.pem'), '-out', join(directory, 'cert.pem'), '-days', '2', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' })
    return { key: readFileSync(join(directory, 'key.pem'), 'utf8'), cert: readFileSync(join(directory, 'cert.pem'), 'utf8') }
  } catch {
    return null
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
const certificate = selfSigned()
const itTls = certificate ? it : it.skip

const failure = async (work: Promise<unknown>): Promise<MailError> => {
  try {
    await work
  } catch (error) {
    expect(error).toBeInstanceOf(MailError)
    return error as MailError
  }
  throw new Error('expected the send to fail')
}

// ---- the SMTP client -------------------------------------------------------------------------------------------------------

describe('the SMTP client', () => {
  let mock: MockServer | null = null
  afterEach(async () => {
    await mock?.close()
    mock = null
  })

  it('hands one message over in the order SMTP wants, and reports what the server said, not "delivered"', async () => {
    mock = await mockSmtp()
    const result = await sendSmtp(smtp(mock.port), message({ to: 'Anna <anna@example.com>' }))
    expect(result.response).toBe('250 2.0.0 Ok: queued as TEST123')
    expect(mock.transcript.map((line) => line.split(' ')[0] + (line.startsWith('MAIL') || line.startsWith('RCPT') ? ` ${line.split(' ')[1]}` : ''))).toEqual(['EHLO', 'MAIL FROM:<no-reply@site.test>', 'RCPT TO:<anna@example.com>', 'DATA', 'QUIT'])
    expect(mock.messages).toHaveLength(1)
    expect(parts(mock.messages[0]).text).toBe('Plain body.')
    expect(mock.messages[0]).toContain('To: Anna <anna@example.com>')
  })

  it('signs in with AUTH PLAIN, or with AUTH LOGIN when that is all the server offers, and refuses wrong credentials for good', async () => {
    mock = await mockSmtp({ auth: 'plain', user: 'mailer', password: 'correct horse' })
    await sendSmtp(smtp(mock.port, { user: 'mailer', password: 'correct horse' }), message())
    expect(mock.transcript.some((line) => line.startsWith('AUTH PLAIN '))).toBe(true)
    const wrong = await failure(sendSmtp(smtp(mock.port, { user: 'mailer', password: 'wrong' }), message()))
    expect(wrong.transient).toBe(false)
    expect(wrong.code).toBe(535)
    expect(mock.messages).toHaveLength(1) // the second attempt sent nothing
    await mock.close()

    mock = await mockSmtp({ auth: 'login', user: 'mailer', password: 'correct horse' })
    await sendSmtp(smtp(mock.port, { user: 'mailer', password: 'correct horse' }), message())
    expect(mock.transcript).toContain('AUTH LOGIN')
    expect((await failure(sendSmtp(smtp(mock.port, { user: 'mailer', password: 'nope' }), message()))).code).toBe(535)
  })

  it('does not send the credentials to a server that offers no way to check them', async () => {
    mock = await mockSmtp({ auth: 'none' })
    const error = await failure(sendSmtp(smtp(mock.port, { user: 'mailer', password: 'secret-value' }), message()))
    expect(error.transient).toBe(false)
    expect(error.message).toMatch(/no supported way to sign in/)
    expect(mock.transcript.join('\n')).not.toMatch(/AUTH|c2VjcmV0/)
    expect(mock.messages).toHaveLength(0)
  })

  it('treats a 4xx as worth trying again and a 5xx as final, wherever it comes in the conversation', async () => {
    const cases: [Partial<MockOptions>, boolean, number | null][] = [
      [{ replies: { greeting: '421 4.3.2 Service shutting down' } }, true, 421],
      [{ replies: { mail: '451 4.3.0 Try again later' } }, true, 451],
      [{ replies: { rcpt: '550 5.1.1 No such mailbox' } }, false, 550],
      [{ replies: { rcpt: '450 4.2.1 Mailbox busy' } }, true, 450],
      [{ replies: { data: '554 5.5.1 No valid recipients' } }, false, 554],
      [{ replies: { end: '452 4.3.1 Insufficient storage' } }, true, 452],
      [{ replies: { end: '554 5.7.1 Message rejected as spam' } }, false, 554],
    ]
    for (const [options, transient, code] of cases) {
      mock = await mockSmtp(options)
      const error = await failure(sendSmtp(smtp(mock.port), message()))
      expect(error.transient, JSON.stringify(options)).toBe(transient)
      expect(error.code, JSON.stringify(options)).toBe(code)
      await mock.close()
    }
    mock = null
  })

  it('treats a dropped connection, a silent server and a closed port as temporary, and says so without leaking the address', async () => {
    mock = await mockSmtp({ dropOn: 'rcpt' })
    const dropped = await failure(sendSmtp(smtp(mock.port), message()))
    expect(dropped.transient).toBe(true)
    expect(dropped.message).toMatch(/closed unexpectedly/)
    await mock.close()

    mock = await mockSmtp({ silent: true })
    const started = Date.now()
    const silent = await failure(sendSmtp(smtp(mock.port, { timeoutMs: 1000 }), message()))
    expect(silent.transient).toBe(true)
    expect(silent.message).toMatch(/did not answer in time/)
    expect(Date.now() - started).toBeLessThan(5000)
    const closed = mock.port
    await mock.close()
    mock = null

    const refused = await failure(sendSmtp(smtp(closed), message()))
    expect(refused.transient).toBe(true)
    expect(refused.message).toMatch(/Could not connect/)
    expect(refused.message).not.toContain('anna@example.com')
  })

  it('refuses a recipient with a line break before it opens a connection', async () => {
    mock = await mockSmtp()
    await expect(sendSmtp(smtp(mock.port), message({ to: 'a@example.com\r\nRCPT TO:<evil@example.com>' }))).rejects.toBeInstanceOf(MimeError)
    expect(mock.transcript).toEqual([])
  })

  itTls('upgrades with STARTTLS before it signs in, and never sends a password in clear text', async () => {
    mock = await mockSmtp({ starttls: certificate!, auth: 'plain', user: 'mailer', password: 'correct horse' })
    await sendSmtp(smtp(mock.port, { host: 'localhost', secure: 'starttls', user: 'mailer', password: 'correct horse', rejectUnauthorized: false }), message())
    const verbs = mock.transcript.map((line) => line.split(' ')[0])
    expect(verbs).toEqual(['EHLO', 'STARTTLS', 'EHLO', 'AUTH', 'MAIL', 'RCPT', 'DATA', 'QUIT'])
    expect(mock.messages).toHaveLength(1)
  })

  it('refuses to continue when a server will not do STARTTLS, and sends nothing readable by anyone on the way', async () => {
    mock = await mockSmtp({ auth: 'plain', user: 'mailer', password: 'correct horse' })
    const error = await failure(sendSmtp(smtp(mock.port, { secure: 'starttls', user: 'mailer', password: 'correct horse' }), message()))
    expect(error.transient).toBe(false)
    expect(error.message).toMatch(/does not offer STARTTLS/)
    expect(mock.transcript.map((line) => line.split(' ')[0])).toEqual(['EHLO'])
  })

  itTls('talks TLS from the first byte on the implicit-TLS port, and checks the certificate unless told not to', async () => {
    mock = await mockSmtp({ implicitTls: certificate! })
    await sendSmtp(smtp(mock.port, { host: 'localhost', secure: 'tls', rejectUnauthorized: false }), message())
    expect(mock.messages).toHaveLength(1)
    const untrusted = await failure(sendSmtp(smtp(mock.port, { host: 'localhost', secure: 'tls', rejectUnauthorized: true }), message()))
    expect(untrusted.transient).toBe(true)
    expect(mock.messages).toHaveLength(1) // the second attempt never got as far as saying hello
  })
})

// ---- the outbox ----------------------------------------------------------------------------------------------------------

describe('the outbox', () => {
  let server: TestServer
  beforeEach(async () => {
    server = await startServer({ env: { EMAIL_MAX_ATTEMPTS: '3' } })
  })
  afterEach(async () => {
    await server.close()
  })

  const notifier = () => server.app.context.notifier
  const deliveries = () => server.db.all<{ id: string; kind: string; recipient: string; status: string; attempts: number; next_attempt_at: string | null; last_error: string | null; provider_message_id: string | null; accepted_at: string | null }>('SELECT * FROM email_deliveries ORDER BY created_at, id')
  /** Lets the send the request kicked off finish, and runs whatever is due. */
  const settle = async () => {
    await new Promise((resolve) => setImmediate(resolve))
    return notifier().processDue()
  }
  const failTransient = (text = 'The mail server is busy.') => new MailError(text, { transient: true, code: 451 })

  it('tells the owner about a new message, in the owner\'s language, with the visitor as Reply-To, after the visitor has been answered', async () => {
    await server.close()
    server = await startServer({ env: { NOTIFY_LANGUAGE: 'hu' } })
    const response = await server.api('/api/contact', { body: contact({ language: 'en', subject: 'Bakery website' }) })
    expect(response.status).toBe(201)
    await settle()
    expect(server.mailer.sent).toHaveLength(1)
    const sent = server.mailer.sent[0]
    expect(sent).toMatchObject({ from: 'Site <no-reply@site.test>', to: 'owner@site.test', replyTo: 'anna@example.com' })
    expect(sent.subject).toBe(`Új üzenet (${response.json.data.reference}): Bakery website`)
    expect(sent.messageId).toMatch(/^[0-9a-f-]{36}@site\.test$/)
    expect(sent.html).toContain('<html lang="hu">')
    const [delivery] = deliveries()
    expect(delivery).toMatchObject({ kind: 'inquiry_received', recipient: 'owner@site.test', status: 'accepted', attempts: 1, next_attempt_at: null, last_error: null, provider_message_id: 'test-1' })
    expect(delivery.accepted_at).toBe(server.clock.now().toISOString())
  })

  it('tells the owner about a quote request with the package named in the owner\'s language', async () => {
    const response = await server.api('/api/quote-requests', { body: quote() })
    expect(response.status).toBe(201)
    await settle()
    // The owner's notification and the visitor's confirmation (on by default for a quote request).
    expect(server.mailer.sent).toHaveLength(2)
    expect(server.mailer.sent[0].subject).toBe(`New quote request (${response.json.data.reference}): Anna Kovács`)
    expect(server.mailer.sent[0].text).toContain('Launch')
    expect(deliveries().find((row) => row.kind === 'quote_received')).toMatchObject({ kind: 'quote_received', status: 'accepted' })
  })

  it('sends nothing, and says nothing is pending, when no provider is configured', async () => {
    await server.close()
    server = await startServer({ env: { EMAIL_PROVIDER: 'none' }, mailer: null })
    expect((await server.api('/api/contact', { body: contact() })).status).toBe(201)
    expect(deliveries()).toEqual([])
    expect(server.app.context.notifier.summary()).toMatchObject({ enabled: false, provider: 'none', pending: 0, failed: 0, accepted: 0 })
  })

  it('answers the visitor "received" even when the mail server is down, and sends the mail when it is back', async () => {
    server.mailer.failNext(failTransient('connect ECONNREFUSED for owner@site.test'))
    const response = await server.api('/api/contact', { body: contact() })
    expect(response.status).toBe(201)
    expect(response.json.data.status).toBe('received')
    await settle()
    let [delivery] = deliveries()
    expect(delivery).toMatchObject({ status: 'pending', attempts: 1, next_attempt_at: new Date(server.clock.now().getTime() + 60_000).toISOString() })
    expect(delivery.last_error).toBe('connect ECONNREFUSED for [address]') // the mailbox is not in the log or the page
    expect(await notifier().processDue()).toEqual({ accepted: 0, failed: 0, retried: 0 }) // not due yet
    server.clock.advance(61_000)
    expect(await notifier().processDue()).toEqual({ accepted: 1, failed: 0, retried: 0 })
    delivery = deliveries()[0]
    expect(delivery).toMatchObject({ status: 'accepted', attempts: 2, last_error: null })
    expect(server.mailer.sent).toHaveLength(1)
  })

  it('waits longer after each failure, and gives up after the configured number of attempts, keeping the reason', async () => {
    server.mailer.failNext(failTransient(), 5)
    await server.api('/api/contact', { body: contact() })
    await settle()
    const pause = () => Math.round((Date.parse(deliveries()[0].next_attempt_at!) - server.clock.now().getTime()) / 60_000)
    expect(pause()).toBe(1)
    server.clock.advance(61_000)
    await notifier().processDue()
    expect(pause()).toBe(5)
    server.clock.advance(5 * 60_000 + 1000)
    await notifier().processDue()
    expect(deliveries()[0]).toMatchObject({ status: 'failed', attempts: 3, next_attempt_at: null, last_error: 'The mail server is busy.' })
    server.clock.advance(24 * 3_600_000)
    expect(await notifier().processDue()).toEqual({ accepted: 0, failed: 0, retried: 0 }) // a failed one is not tried again by itself
    expect(server.mailer.sent).toHaveLength(0)
    expect(notifier().summary()).toMatchObject({ failed: 1, pending: 0, lastFailure: { error: 'The mail server is busy.' } })
  })

  it('gives up at once on a refusal that waiting cannot fix, and on a message that cannot be built', async () => {
    server.mailer.failNext(new MailError('550 5.1.1 No such mailbox', { transient: false, code: 550 }))
    await server.api('/api/contact', { body: contact() })
    await settle()
    expect(deliveries()[0]).toMatchObject({ status: 'failed', attempts: 1, last_error: '550 5.1.1 No such mailbox' })
    server.db.run('DELETE FROM email_deliveries')
    server.mailer.failNext(new MimeError('An address contains a line break.') as never)
    await server.api('/api/contact', { body: contact({ subject: 'A second message' }) })
    await settle()
    expect(deliveries()[0]).toMatchObject({ status: 'failed', attempts: 1 })
    server.db.run('DELETE FROM email_deliveries')
    server.mailer.failNext(new Error('something unexpected') as never)
    await server.api('/api/contact', { body: contact({ subject: 'A third message' }) })
    await settle()
    expect(deliveries()[0]).toMatchObject({ status: 'pending', attempts: 1 }) // an unknown error might pass: it is retried
  })

  it('cancels a message whose record is gone instead of sending an empty mail, and picks up one a dead process left half-sent', async () => {
    const now = server.clock.now().toISOString()
    server.db.run("INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, status, attempts, next_attempt_at, created_at, updated_at) VALUES ('gone', 'inquiry_received', 'inquiry', 'no-such-record', 'owner@site.test', 'en', 'pending', 0, ?, ?, ?)", [now, now, now])
    await notifier().processDue()
    expect(deliveries()[0]).toMatchObject({ id: 'gone', status: 'cancelled', last_error: 'The record this message was about no longer exists.' })
    expect(server.mailer.attempts).toBe(0)

    await server.api('/api/contact', { body: contact() })
    await settle()
    // As a process that died in the middle of a send leaves it: claimed ("sending"), still carrying the time it was due.
    server.db.run("UPDATE email_deliveries SET status = 'sending', accepted_at = NULL, provider_message_id = NULL, next_attempt_at = ?, updated_at = ? WHERE kind = 'inquiry_received' AND id != 'gone'", [now, now])
    server.clock.advance(11 * 60_000)
    expect(await notifier().processDue()).toEqual({ accepted: 1, failed: 0, retried: 0 })
    expect(server.mailer.sent).toHaveLength(2)
  })

  it('sends each message once, even when two runs start together', async () => {
    await server.api('/api/contact', { body: contact() })
    await Promise.all([notifier().processDue(), notifier().processDue(), notifier().processDue()])
    await settle()
    expect(server.mailer.sent).toHaveLength(1)
    expect(deliveries()).toHaveLength(1)
    expect(deliveries()[0].attempts).toBe(1)
  })

  it('says "accepted by the provider" and nowhere that it was delivered', async () => {
    await server.api('/api/contact', { body: contact() })
    await settle()
    const admin = await server.signIn()
    const overview = await server.api('/api/admin/notifications', { headers: { Cookie: admin.cookie } })
    expect(overview.json.data.deliveries).toHaveLength(1)
    expect(overview.json.data.deliveries[0]).toMatchObject({ kind: 'inquiry_received', status: 'accepted', recipient: 'owner@site.test' })
    expect(overview.json.data.counts).toEqual({ pending: 0, sent: 1, delivered: 0, failed: 0, bounced: 0 })
    // Nothing here has been confirmed by a provider event, so nothing is delivered: the count of delivered is zero and no message has that status.
    expect(overview.json.data.counts.delivered).toBe(0)
    expect(overview.json.data.deliveries.every((d: { status: string }) => d.status !== 'delivered')).toBe(true)
    expect(server.db.get("SELECT COUNT(*) AS n FROM email_deliveries WHERE status = 'delivered' OR delivered_at IS NOT NULL")).toEqual({ n: 0 })
  })
})

describe('the outbox with a real SMTP server', () => {
  let server: TestServer | null = null
  let mock: MockServer | null = null
  afterEach(async () => {
    await server?.close()
    await mock?.close()
    server = null
    mock = null
  })

  const env = (port: number) => ({ EMAIL_PROVIDER: 'smtp', SMTP_HOST: '127.0.0.1', SMTP_PORT: String(port), SMTP_SECURE: 'none', SMTP_USER: 'mailer', SMTP_PASSWORD: 'correct horse', SMTP_TIMEOUT_MS: '2000' })

  it('sends over SMTP, and records the server\'s own acknowledgement', async () => {
    mock = await mockSmtp({ auth: 'plain', user: 'mailer', password: 'correct horse' })
    server = await startServer({ env: env(mock.port), realMailer: true })
    const response = await server.api('/api/contact', { body: contact({ name: 'Kovács Ánna', subject: 'Új weboldal' }) })
    expect(response.status).toBe(201)
    await new Promise((resolve) => setImmediate(resolve))
    await server.app.context.notifier.processDue()
    expect(mock.messages).toHaveLength(1)
    const mime = parts(mock.messages[0])
    expect(mime.headers).toContain('To: owner@site.test')
    expect(mime.headers).toContain('Reply-To: anna@example.com')
    expect(mime.headers).toMatch(/Subject: =\?UTF-8\?B\?/) // the Hungarian subject travels encoded
    expect(mime.text).toContain('Kovács Ánna')
    expect(server.db.get('SELECT status, attempts, provider_message_id FROM email_deliveries')).toEqual({ status: 'accepted', attempts: 1, provider_message_id: '250 2.0.0 Ok: queued as TEST123' })
  })

  it('keeps the message and sends it later when the mail server is not there, then when it comes back', async () => {
    mock = await mockSmtp({ auth: 'plain', user: 'mailer', password: 'correct horse' })
    const port = mock.port
    await mock.close()
    server = await startServer({ env: env(port), realMailer: true })
    expect((await server.api('/api/contact', { body: contact() })).status).toBe(201)
    await new Promise((resolve) => setImmediate(resolve))
    await server.app.context.notifier.processDue()
    expect(server.db.get('SELECT status, attempts FROM email_deliveries')).toEqual({ status: 'pending', attempts: 1 })
    expect(server.db.get<{ last_error: string }>('SELECT last_error FROM email_deliveries')!.last_error).toMatch(/Could not connect to the mail server/)
    mock = await mockSmtp({ auth: 'plain', user: 'mailer', password: 'correct horse' }, port)
    server.clock.advance(61_000)
    await server.app.context.notifier.processDue()
    expect(server.db.get('SELECT status, attempts FROM email_deliveries')).toEqual({ status: 'accepted', attempts: 2 })
    expect(mock.messages).toHaveLength(1)
  })

  it('does not accept a rejected sign-in as a success: the message stays unsent and is marked failed', async () => {
    mock = await mockSmtp({ auth: 'plain', user: 'mailer', password: 'a different password' })
    server = await startServer({ env: env(mock.port), realMailer: true })
    await server.api('/api/contact', { body: contact() })
    await new Promise((resolve) => setImmediate(resolve))
    await server.app.context.notifier.processDue()
    expect(server.db.get('SELECT status, attempts FROM email_deliveries')).toEqual({ status: 'failed', attempts: 1 })
    expect(mock.messages).toHaveLength(0)
    expect(server.db.get<{ last_error: string }>('SELECT last_error FROM email_deliveries')!.last_error).toMatch(/535/)
    expect(server.db.get<{ last_error: string }>('SELECT last_error FROM email_deliveries')!.last_error).not.toContain('correct horse')
  })
})
