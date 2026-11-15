import { describe, expect, it } from 'vitest'
import { htmlToText } from '../src/modules/gmail/html.ts'
import { MIME_LIMITS, MimeError, parseAddresses, parseGmailMessage } from '../src/modules/gmail/mime.ts'
import { b64, filePart, gmailMessage, multipart, textPart } from './gmailKit.ts'

/** The Gmail message parser: what it reads, what it refuses, and that nothing in a message is ever treated as anything but text. */

const parse = (options: Parameters<typeof gmailMessage>[0], limits = MIME_LIMITS) => parseGmailMessage(gmailMessage(options), limits)
const refused = (raw: unknown, limits = MIME_LIMITS): string => {
  try {
    parseGmailMessage(raw, limits)
  } catch (error) {
    expect(error).toBeInstanceOf(MimeError)
    return (error as MimeError).reason
  }
  return 'accepted'
}

describe('a plain text message', () => {
  it('is read with its ids, addresses, subject, dates and conversation headers', () => {
    const parsed = parse({
      id: 'abc123',
      threadId: 'thread9',
      internalDate: Date.parse('2026-11-03T10:15:00Z'),
      from: 'Anna Kovács <Anna@Example.com>',
      to: 'Site <mailbox@site.test>, second@site.test',
      cc: '"Doe, Jane" <jane@example.org>',
      subject: 'A new website',
      date: 'Tue, 03 Nov 2026 11:14:00 +0100',
      messageId: '<m1@mail.example.com>',
      inReplyTo: '<prev@site.test>',
      references: '<first@site.test> <prev@site.test>',
      text: 'Hello,\r\n\r\nI would like a small website.\r\n\r\n\r\n\r\nThanks',
    })
    expect(parsed).toMatchObject({
      gmailMessageId: 'abc123',
      gmailThreadId: 'thread9',
      rfcMessageId: '<m1@mail.example.com>',
      from: { name: 'Anna Kovács', address: 'anna@example.com' },
      subject: 'A new website',
      receivedAt: '2026-11-03T10:15:00.000Z',
      sentAt: '2026-11-03T10:14:00.000Z',
      inReplyTo: '<prev@site.test>',
      references: ['<first@site.test>', '<prev@site.test>'],
      bodyTruncated: false,
      attachments: [],
    })
    expect(parsed.recipients).toEqual([
      { name: 'Site', address: 'mailbox@site.test', type: 'to' },
      { name: '', address: 'second@site.test', type: 'to' },
      { name: 'Doe, Jane', address: 'jane@example.org', type: 'cc' },
    ])
    expect(parsed.bodyText).toBe('Hello,\n\nI would like a small website.\n\nThanks')
    expect(parsed.labels).toEqual(['INBOX', 'UNREAD'])
  })

  it('takes the time from Gmail, which the sender cannot choose, and the Date header only as a claim', () => {
    const parsed = parse({ id: 'm1', internalDate: Date.parse('2026-11-03T10:15:00Z'), date: 'Fri, 01 Jan 2010 00:00:00 +0000' })
    expect(parsed.receivedAt).toBe('2026-11-03T10:15:00.000Z')
    expect(parsed.sentAt).toBe('2010-01-01T00:00:00.000Z')
    expect(parse({ id: 'm2', date: 'not a date at all' }).sentAt).toBeNull()
  })

  it('has no sender, not an invented one, when the From header is missing or not an address', () => {
    expect(parse({ id: 'm1', from: 'undisclosed recipients' }).from).toBeNull()
    const raw = gmailMessage({ id: 'm2' }) as { payload: { headers: { name: string }[] } }
    raw.payload.headers = raw.payload.headers.filter((header) => header.name !== 'From')
    expect(parseGmailMessage(raw).from).toBeNull()
  })

  it('removes control characters and bidirectional tricks, and keeps tabs and line breaks', () => {
    const parsed = parse({ id: 'm1', text: 'a\u0000b\u0007c\td\u202eevil\u202c\ne\u200ff' })
    expect(parsed.bodyText).toBe('abc\tdevilc\ne'.replace('devilc', 'devil') + 'f')
  })
})

describe('an HTML-only message', () => {
  const html = '<html><head><title>Hidden</title><style>.x{color:red}</style></head><body><p>Hello <b>Anna</b>,</p><script>alert("x")</script><ul><li>one</li><li>two &amp; three</li></ul><img src="https://tracker.example/pixel.gif"><a href="https://evil.example/">a link</a><br>Bye&nbsp;now &eacute;&#233;&#x151;</body></html>'

  it('becomes readable text, with no markup, no script, no style and nothing remote', () => {
    const parsed = parse({ id: 'h1', payload: textPart(html, { type: 'text/html' }) })
    expect(parsed.bodyText).toBe('Hello Anna,\n\n- one\n- two & three\na link\nBye now ééő')
    for (const forbidden of ['<', 'alert', 'color:red', 'Hidden', 'tracker.example', 'evil.example', 'pixel']) expect(parsed.bodyText, forbidden).not.toContain(forbidden)
  })

  it('is read as text by the converter in the cases a mail client sees every day', () => {
    expect(htmlToText('plain text without tags')).toBe('plain text without tags')
    expect(htmlToText('a <b>bold</b> and <i>italic</i> word')).toBe('a bold and italic word')
    expect(htmlToText('<div>one</div><div>two</div>')).toBe('one\ntwo')
    expect(htmlToText('1 < 2 and 3 > 2')).toBe('1 < 2 and 3 > 2')
    expect(htmlToText('<p>line one<br/>line two</p>')).toBe('line one\nline two')
    expect(htmlToText('<table><tr><td>a</td><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>')).toBe('a b\nc d')
    expect(htmlToText('<!-- a comment <b>hidden</b> -->visible')).toBe('visible')
    expect(htmlToText('<a title="x > y">link</a>')).toBe('link')
  })

  it('survives broken and hostile HTML without hanging, throwing or leaking markup', () => {
    expect(htmlToText('<script>never closed alert(1)')).toBe('')
    expect(htmlToText('<style>body{}</style>after')).toBe('after')
    expect(htmlToText('<div <b>nested')).toBe('<div nested')
    expect(htmlToText('text <')).toBe('text <')
    expect(htmlToText('<!DOCTYPE html><?xml version="1.0"?>x')).toBe('x')
    expect(htmlToText('&#0;&#x110000;&#xD800;&bogus;&amp;')).toBe('&bogus;&')
    const started = Date.now()
    const nasty = '<'.repeat(200_000) + 'a'.repeat(200_000) + '<a '.repeat(50_000) + '&'.repeat(100_000)
    expect(typeof htmlToText(nasty)).toBe('string')
    expect(htmlToText('<a href="' + 'x'.repeat(100_000) + '">text</a>')).toContain('text')
    expect(Date.now() - started, 'linear time').toBeLessThan(2000)
  })
})

describe('a multipart message', () => {
  it('prefers the plain text of multipart/alternative and ignores its HTML twin', () => {
    const parsed = parse({ id: 'a1', payload: multipart('multipart/alternative', [textPart('The plain version.'), textPart('<p>The <b>HTML</b> version.</p>', { type: 'text/html', partId: '1' })]) })
    expect(parsed.bodyText).toBe('The plain version.')
  })

  it('falls back to the HTML of an alternative whose plain part is empty', () => {
    const parsed = parse({ id: 'a2', payload: multipart('multipart/alternative', [textPart('  \n '), textPart('<p>Only <b>HTML</b> says something.</p>', { type: 'text/html', partId: '1' })]) })
    expect(parsed.bodyText).toBe('Only HTML says something.')
  })

  it('reads a text body inside multipart/mixed and lists the file beside it, as metadata only', () => {
    const parsed = parse({
      id: 'x1',
      payload: multipart('multipart/mixed', [multipart('multipart/alternative', [textPart('Body text.'), textPart('<p>Body</p>', { type: 'text/html', partId: '0.1' })]), filePart('../../etc/passwd.pdf', 'application/pdf', 52_000, { partId: '1' })]),
    })
    expect(parsed.bodyText).toBe('Body text.')
    expect(parsed.attachments).toEqual([{ partId: '1', filename: 'passwd.pdf', mimeType: 'application/pdf', size: 52_000, inline: false }])
    expect(JSON.stringify(parsed)).not.toContain('ATTACHMENT-ID-OF-GOOGLE')
  })

  it('lists an inline picture as inline, and never takes an attached text file for the body', () => {
    const parsed = parse({
      id: 'r1',
      payload: multipart('multipart/related', [textPart('<p>See <img src="cid:logo"></p>', { type: 'text/html' }), filePart('logo.png', 'image/png', 2048, { partId: '1', inline: true, contentId: 'logo' }), { ...textPart('notes inside a file', { partId: '2' }), filename: 'notes.txt' }]),
    })
    expect(parsed.bodyText).toBe('See')
    expect(parsed.attachments.map((entry) => [entry.filename, entry.inline])).toEqual([['logo.png', true], ['notes.txt', false]])
  })

  it('shows only the base name and a safe type for an attachment whatever it declares', () => {
    const part = filePart('C:\\Users\\x\\<script>.exe', 'application/x-evil; charset=\u0000', 10)
    const parsed = parse({ id: 'f1', payload: multipart('multipart/mixed', [textPart('hi'), part]) })
    expect(parsed.attachments[0].filename).toBe('_script_.exe')
    expect(parsed.attachments[0].mimeType).toMatch(/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/)
  })
})

describe('encoded text', () => {
  it('decodes RFC 2047 words (B and Q, UTF-8 and ISO-8859-2) in the subject and in names, joining adjacent words', () => {
    const subject = `=?UTF-8?B?${b64('Árvíztűrő tükörfúrógép')}?= =?UTF-8?Q?_aj=C3=A1nlat_=C5=91?=`
    const parsed = parse({ id: 'e1', subject, from: `=?ISO-8859-2?Q?Kov=E1cs_=C1nna?= <anna@example.com>` })
    expect(parsed.subject).toBe('Árvíztűrő tükörfúrógép ajánlat ő')
    expect(parsed.from).toEqual({ name: 'Kovács Ánna', address: 'anna@example.com' })
  })

  it('decodes the body in the charset the part declares', () => {
    const latin2 = Buffer.from([0x4b, 0x6f, 0x76, 0xe1, 0x63, 0x73, 0x20, 0xf5]) // "Kovács ő" in ISO-8859-2
    expect(parse({ id: 'c1', payload: textPart(latin2, { charset: 'ISO-8859-2' }) }).bodyText).toBe('Kovács ő')
    expect(parse({ id: 'c2', payload: textPart(Buffer.from('árvíztűrő'), { charset: 'x-unknown-charset' }) }).bodyText).toBe('árvíztűrő')
  })

  it('keeps a header that does not decode as it is, and never throws on one', () => {
    // Not an encoded word at all (it has spaces in it): shown as it is.
    expect(parse({ id: 'e2', subject: '=?UTF-8?B?!!!not base64!!!?=' }).subject).toBe('=?UTF-8?B?!!!not base64!!!?=')
    // An encoded word with garbage in it, or with a charset nobody knows, is decoded as well as it can be and never throws.
    expect(typeof parse({ id: 'e2b', subject: '=?UTF-8?B?!!!notbase64!!!?=' }).subject).toBe('string')
    expect(parse({ id: 'e3', subject: '=?bogus-charset?Q?abc?=' }).subject).toBe('abc')
  })

  it('cuts a header at the limit and never lets a line break into it', () => {
    const parsed = parse({ id: 'e4', subject: `Line one\r\nBcc: attacker@example.com ${'x'.repeat(1000)}` })
    expect(parsed.subject).not.toMatch(/[\r\n]/)
    expect(parsed.subject.length).toBeLessThanOrEqual(500)
  })
})

describe('addresses', () => {
  it('reads names with commas, quotes and comments, and drops what is not an address', () => {
    expect(parseAddresses('"Smith, John" <john@example.com>, jane@example.com (Jane), Bob <not-an-address>, <>, "x" <bad@@example.com>, Group: a@example.com;', 10)).toEqual([
      { name: 'Smith, John', address: 'john@example.com' },
      { name: '', address: 'jane@example.com' },
      { name: '', address: 'a@example.com' },
    ])
  })

  it('stops at the limit', () => {
    const many = Array.from({ length: 200 }, (_, i) => `u${i}@example.com`).join(', ')
    expect(parseAddresses(many, 50)).toHaveLength(50)
    expect(parse({ id: 'm1', to: many }).recipients).toHaveLength(50)
  })
})

describe('what is refused', () => {
  it.each([
    ['not an object', 'a string'],
    ['null', null],
    ['an array', []],
    ['no id', { threadId: 't', internalDate: '1', payload: {} }],
    ['an id that is a path', { id: '../../etc', threadId: 't', internalDate: '1700000000000', payload: {} }],
    ['no payload', { id: 'a', threadId: 't', internalDate: '1700000000000' }],
    ['a date that is not a number', { id: 'a', threadId: 't', internalDate: 'yesterday', payload: {} }],
    ['a date before the internet', { id: 'a', threadId: 't', internalDate: '1000', payload: {} }],
    ['parts that are not parts', { id: 'a', threadId: 't', internalDate: '1700000000000', payload: { mimeType: 'multipart/mixed', parts: ['x'] } }],
    ['a body that is not base64', { id: 'a', threadId: 't', internalDate: '1700000000000', payload: { mimeType: 'text/plain', body: { data: 'not base64!!' } } }],
  ])('as malformed: %s', (_name, raw) => {
    expect(refused(raw)).toBe('malformed')
  })

  it('as malformed when it nests deeper than any real message', () => {
    let part: object = textPart('deep')
    for (let i = 0; i < 20; i += 1) part = { mimeType: 'multipart/mixed', headers: [], body: {}, parts: [part] }
    expect(refused({ id: 'a', threadId: 't', internalDate: '1700000000000', payload: part })).toBe('malformed')
  })

  it('as too large: one part, all the parts together, and too many parts', () => {
    const small = { ...MIME_LIMITS, partBytes: 1000, totalBytes: 1500, maxParts: 6 }
    expect(refused(gmailMessage({ id: 'a', text: 'x'.repeat(2000) }), small)).toBe('too_large')
    expect(refused(gmailMessage({ id: 'b', payload: multipart('multipart/mixed', [textPart('y'.repeat(900)), textPart('z'.repeat(900), { partId: '1' })]) }), small)).toBe('too_large')
    expect(refused(gmailMessage({ id: 'c', payload: multipart('multipart/mixed', Array.from({ length: 10 }, (_, i) => textPart('p', { partId: String(i) }))) }), small)).toBe('too_large')
    expect(refused(gmailMessage({ id: 'd', text: 'fine' }), small)).toBe('accepted')
  })

  it('without ever decoding a body that is over the limit (its size is known from its encoding)', () => {
    const hostile = gmailMessage({ id: 'a', payload: { mimeType: 'text/plain', headers: [], body: { size: 0, data: 'A'.repeat(5_000_000) } } })
    const started = Date.now()
    expect(refused(hostile)).toBe('too_large')
    expect(Date.now() - started).toBeLessThan(500)
  })

  it('and its error says nothing about the message', () => {
    try {
      parseGmailMessage(gmailMessage({ id: 'a', text: 'SECRET-BODY-TEXT '.repeat(100_000) }))
      expect.unreachable()
    } catch (error) {
      expect(String((error as Error).message) + String((error as Error).stack)).not.toContain('SECRET-BODY-TEXT')
    }
  })
})

describe('the size of what is kept', () => {
  it('cuts a long body and says so, without splitting a character', () => {
    const emoji = '😀'
    const parsed = parse({ id: 'l1', text: emoji.repeat(100) }, { ...MIME_LIMITS, bodyChars: 51 })
    expect(parsed.bodyTruncated).toBe(true)
    expect(parsed.bodyText).toBe(emoji.repeat(25))
    expect(parse({ id: 'l2', text: 'short' }).bodyTruncated).toBe(false)
  })

  it('says a body Gmail did not inline was not read', () => {
    const parsed = parse({ id: 'l3', payload: { mimeType: 'text/plain', headers: [], body: { size: 9_000_000, attachmentId: 'BODY-AS-ATTACHMENT' } } })
    expect(parsed.bodyText).toBe('')
    expect(parsed.bodyTruncated).toBe(true)
  })

  it('keeps at most the limit of attachments', () => {
    const files = Array.from({ length: 150 }, (_, i) => filePart(`f${i}.txt`, 'text/plain', 1, { partId: String(i + 1) }))
    expect(parse({ id: 'm1', payload: multipart('multipart/mixed', [textPart('x'), ...files]) }).attachments).toHaveLength(MIME_LIMITS.maxAttachments)
  })
})
