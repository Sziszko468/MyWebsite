import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LANGUAGES, type Language } from '../i18n/config'
import { findPage } from '../routes/pages'
import { privacyMeta } from './privacyMeta'
import { privacyText, storedItems } from './privacy'

const SRC = join(process.cwd(), 'src')
function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}
const posix = (path: string) => relative(SRC, path).split(sep).join('/')

/**
 * Every source file that reads or writes the browser's storage. A new file that touches storage has to be
 * added here, which is the moment to add its item to content/privacy.ts and say what it keeps.
 */
const STORAGE_USERS = [
  'ai/client.ts',
  'analytics/consent.ts',
  'components/intro/introPolicy.ts',
  'components/lab/artifacts/artifactDb.ts',
  'components/lab/core/useLabView.ts',
  'components/lab/experience/persist.ts',
  'motion/scrollRestoration.ts',
  'shop/cartStore.ts',
  'theme/theme.ts',
]

/** Where each stored item's name is written in the code (some files are handed a storage by another). */
const KEY_OWNERS: Record<string, string[]> = {
  'ai/client.ts': ['cc-ai'],
  'analytics/consent.ts': ['cc-consent-v1'],
  'components/intro/introPolicy.ts': ['intro:seen', 'intro:skip'],
  'components/lab/artifacts/artifactDb.ts': ['lab-artifacts'],
  'components/lab/core/labMode.ts': ['lab:view'],
  'i18n/locale.ts': ['cc_lang'],
  'components/lab/core/quality.ts': ['lab:quality'],
  'motion/scrollRestoration.ts': ['cc:scroll-positions'],
  'shop/cartStore.ts': ['cc-shop-cart-v1'],
  'theme/theme.ts': ['theme'],
}

describe('the privacy notice', () => {
  it('is a page in every language, with its own title and description', () => {
    expect(findPage('/privacy')?.languages).toEqual([...LANGUAGES])
    for (const lang of LANGUAGES) {
      expect(privacyMeta.title[lang].length).toBeGreaterThan(5)
      expect(privacyMeta.description[lang].length).toBeGreaterThan(60)
    }
  })

  it('lists every place the site touches browser storage, and every item it keeps', () => {
    const users = sources()
      .filter((file) => /\b(localStorage|sessionStorage|indexedDB)\b/.test(readFileSync(file, 'utf8')))
      .map(posix)
      // The sources whose only mention of storage is a comment or content about another project's code do not count.
      .filter((file) => !file.startsWith('content/projectDetails/') && file !== 'content/privacy.ts')
      // The administration (src/admin) is not the visitors' site: it is a separate page, behind a sign-in, that only the owner's
      // administrators ever load. What it keeps (whether the sidebar is collapsed; docs/admin/README.md lists it) is their own
      // interface preference, so it is not part of the notice to visitors. The visitors' pages never import it.
      .filter((file) => !file.startsWith('admin/'))
    expect(users.sort()).toEqual([...STORAGE_USERS].sort())

    const listed = new Set(storedItems.flatMap((item) => item.name.split(', ')))
    const claimed = new Set(Object.values(KEY_OWNERS).flat())
    expect([...claimed].sort()).toEqual([...listed].sort())
  })

  it('names each stored item exactly as the code writes it', () => {
    for (const [file, keys] of Object.entries(KEY_OWNERS)) {
      const text = readFileSync(join(SRC, file), 'utf8')
      for (const key of keys) expect(text, `${file} ${key}`).toContain(`'${key}'`)
    }
  })

  it('says, truthfully, that exactly one cookie is set: the language choice, written in one place', () => {
    const users = sources()
      .filter((file) => /document\.cookie|Set-Cookie/i.test(readFileSync(file, 'utf8')))
      .map(posix)
    expect(users).toEqual(['i18n/preference.ts'])
    expect(storedItems.filter((item) => item.where === 'cookie').map((item) => item.name)).toEqual(['cc_lang'])
    for (const lang of LANGUAGES) {
      expect(privacyText.cookies.text[lang]).toContain('cc_lang')
      expect(privacyText.cookies.text[lang].length).toBeGreaterThan(100)
    }
  })

  it('explains the country-based starting language without claiming what the code does not do', () => {
    for (const lang of LANGUAGES) {
      const text = privacyText.language.items.map((item) => item[lang]).join(' ')
      expect(text, lang).toMatch(/Cloudflare/)
    }
    // The Worker reads the country only: its source must not read an IP address or log anything.
    const worker = readFileSync(join(process.cwd(), 'worker', 'routing.ts'), 'utf8') + readFileSync(join(process.cwd(), 'worker', 'index.ts'), 'utf8')
    expect(worker).not.toMatch(/request\.headers\.get\('(cf-connecting-ip|x-forwarded-for|x-real-ip)'|console\./i)
  })

  it('does not promise what only the owner can decide: no retention periods, legal bases, guarantees or named recipients', () => {
    const everything = JSON.stringify(privacyText) + JSON.stringify(storedItems)
    expect(everything).not.toMatch(/\b\d+\s*(days?|nap|dagen|months?|hónap|maanden|years?|év|jaar)\b/i)
    expect(everything).not.toMatch(/GDPR|AVG|legitimate interest|jogos érdek|gerechtvaardigd belang|guarantee|garan/i)
  })

  it('does not claim a measurement the site does not do', () => {
    // The notice has one wording for "no measurement" and a different one for "measurement on": the page picks by configuration.
    expect(privacyText.measurement.on.length).toBeGreaterThan(0)
    for (const lang of LANGUAGES) expect(privacyText.measurement.off[lang]).toMatch(/nem|not|geen/i)
  })
})

/**
 * PROMPT 24.1: the consultation booking in the notice. Every sentence here is held against the booking code (read as text, as the storage test above reads
 * the sources) or against a behaviour server/test/bookingPrivacy.test.ts runs, so the notice cannot drift from what the site does.
 */
const ROOT = process.cwd()
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')
const bookingText = (lang: Language) => privacyText.booking.items.map((item) => item[lang]).join('\n')
const recipientText = (lang: Language) => privacyText.recipients.items.map((item) => item[lang]).join('\n')
const noticeText = (lang: Language) => [bookingText(lang), recipientText(lang)].join('\n')

describe('the privacy notice and the consultation booking', () => {
  // What the booking stores (migration 0011), one sentence of the notice for each, in each language. A new column in `bookings` that the notice does not
  // describe is caught by the next test.
  const SAYS: Record<string, Record<Language, RegExp>> = {
    'name and email address': { hu: /neved és az e-mail-címed/, en: /name and email address/, nl: /naam en e-mailadres/ },
    company: { hu: /a cég nevét/, en: /your company/, nl: /je bedrijf/ },
    'website address': { hu: /weboldalad címét/, en: /your website address/, nl: /het adres van je website/ },
    'project description': { hu: /projektleírásodat/, en: /a description of your project/, nl: /een omschrijving van je project/ },
    'related quote request or inquiry reference': { hu: /ajánlatkérés vagy megkeresés azonosítóját/, en: /reference of a related quote request or inquiry/, nl: /referentie van een bijbehorende offerteaanvraag of aanvraag/ },
    'consultation type, date, time and time zone': { hu: /konzultáció típusát, a dátumot[^.]*időzónát/, en: /type of consultation, the date[^.]*time zone/, nl: /soort adviesgesprek, de datum[^.]*tijdzone/ },
    'status and history': { hu: /állapotát[^.]*előzményeit/, en: /status[^.]*history/, nl: /status van de afspraak[^.]*geschiedenis/ },
    'consent timestamp': { hu: /mikor jelölted be a hozzájáruló mondatot/, en: /when you ticked the sentence/, nl: /wanneer je de zin hebt aangevinkt/ },
    'one-way fingerprint of the network address': { hu: /hálózati címed egyirányú ujjlenyomatát/, en: /one-way fingerprint of your network address/, nl: /eenrichtingsvingerafdruk van je netwerkadres/ },
    'technical submission key and fingerprint': { hu: /Technikai adat az is[^.]*kulcsot[^.]*ujjlenyomatot/, en: /Two technical items[^.]*key your browser makes[^.]*fingerprint/, nl: /twee technische gegevens[^.]*sleutel[^.]*vingerafdruk/ },
    'secure link, only a fingerprint stored': { hu: /linkből csak egyirányú ujjlenyomat van eltárolva/, en: /Only a one-way fingerprint of the link’s secret part is stored/, nl: /alleen een eenrichtingsvingerafdruk bewaard/ },
    'private notes of the owner': { hu: /privát jegyzeteket/, en: /private notes/, nl: /privénotities/ },
    'e-mail log': { hu: /Az üzenetekről napló készül/, en: /The messages are logged/, nl: /De berichten worden gelogd/ },
    retention: { hu: /Hogy meddig őrizzük a foglalásokat/, en: /How long bookings are kept/, nl: /Hoe lang afspraken worden bewaard/ },
    erasure: { hu: /törölni szeretnéd/, en: /want it deleted/, nl: /dat het wordt verwijderd/ },
  }

  it('describes the booking data in every language: each kind of data, the purpose, the retention and the erasure', () => {
    for (const lang of LANGUAGES) {
      for (const [what, patterns] of Object.entries(SAYS)) expect(bookingText(lang), `${lang}: ${what}`).toMatch(patterns[lang])
      for (const item of privacyText.booking.items) expect(item[lang].length, lang).toBeGreaterThan(80)
    }
    // The three languages say the same things in the same order.
    const ranking = (lang: Language) =>
      Object.keys(SAYS)
        .map((what): [string, number] => [what, bookingText(lang).search(SAYS[what][lang])])
        .sort((a, b) => a[1] - b[1])
        .map(([what]) => what)
    expect(ranking('en')).toEqual(ranking('hu'))
    expect(ranking('nl')).toEqual(ranking('hu'))
  })

  it('describes every column the booking table keeps about a person, so a new one cannot be added without the notice', () => {
    const table = /CREATE TABLE bookings \(([\s\S]*?)\n\);/.exec(read('server/src/db/migrations/0011_consultation_booking.sql'))![1]
    const columns = table
      .split('\n')
      .map((line) => /^\s{2}([a-z_]+)\s+(TEXT|INTEGER)/.exec(line)?.[1])
      .filter((name): name is string => Boolean(name))
    // What each column is, and the item of the notice that tells the visitor about it (or why it is not personal).
    const COVERED: Record<string, string> = {
      id: 'internal', reference: 'internal', consultation_type_id: 'the type', language: 'the language', name: 'name', email: 'email', company: 'company', website: 'website', description: 'description',
      start_at: 'date and time', end_at: 'date and time', time_zone: 'time zone', status: 'status', related_reference: 'related reference', quote_request_id: 'the link to the quote request',
      idempotency_key: 'internal: stops a double click making two bookings', request_hash: 'internal: a hash of what was submitted', ip_hash: 'fingerprint of the network address', consent_at: 'consent timestamp',
      created_at: 'history', updated_at: 'history', confirmed_at: 'history', cancelled_at: 'history', cancelled_by: 'history', cancellation_note: 'the reason the person wrote', completed_at: 'history',
    }
    expect(columns.sort()).toEqual(Object.keys(COVERED).sort())
  })

  it('gives no retention period, and says what the code does: the owner sets it, nothing is deleted by age while it is unset', () => {
    // No digit at all in the booking sections: no number of days, months or years that the code does not fix.
    for (const lang of LANGUAGES) {
      expect(bookingText(lang), lang).not.toMatch(/\d/)
      expect(recipientText(lang), lang).not.toMatch(/\d/)
    }
    expect(bookingText('hu')).toMatch(/az oldal tulajdonosának beállítása/)
    expect(bookingText('en')).toMatch(/is the site owner’s setting/)
    expect(bookingText('nl')).toMatch(/is de instelling van de eigenaar van de site/)
    // Unset: nothing is deleted because of its age.
    expect(bookingText('hu')).toMatch(/Ha nincs megőrzési idő beállítva, az oldal semmit nem töröl az életkora alapján/)
    expect(bookingText('en')).toMatch(/If no retention period is set, nothing is deleted because of its age/)
    expect(bookingText('nl')).toMatch(/Is er geen bewaartermijn ingesteld, dan wordt niets verwijderd vanwege de leeftijd/)
    // A booking that is still alive is not deleted by age.
    expect(bookingText('hu')).toMatch(/Egy még élő foglalást az idő önmagában nem töröl/)
    expect(bookingText('en')).toMatch(/A booking that is still active is never deleted just because time has passed/)
    expect(bookingText('nl')).toMatch(/Een afspraak die nog loopt wordt nooit verwijderd alleen omdat er tijd is verstreken/)
  })

  it('matches the code on retention: the period is optional, only finished bookings are deleted, and the housekeeping is a daily timer', () => {
    expect(read('server/src/config.ts')).toMatch(/const retentionDays = retention === null \? null : integer\('RETENTION_DAYS'/)
    const maintenance = read('server/src/modules/system/maintenance.ts')
    expect(maintenance).toMatch(/if \(config\.retentionDays !== null\) \{[\s\S]*purgeFinishedBookings\(app, cutoff\)/)
    expect(read('server/src/modules/bookings/retention.ts')).toContain("status IN ('cancelled', 'completed', 'no_show')")
    expect(read('server/src/modules/bookings/retention.ts')).not.toMatch(/'pending'|'confirmed'|'reschedule_requested'|'rescheduled'/)
    expect(read('server/src/main.ts')).toMatch(/setInterval\([\s\S]*runMaintenance\(app\.context\)[\s\S]*\}, DAY\)/)
    // The links: the housekeeping forgets a link's hash a month after it expired, whether or not a period is set.
    expect(read('server/src/modules/bookings/repository.ts')).toMatch(/purgeBookingTokens[\s\S]*-30 \* DAY/)
    expect(maintenance).toMatch(/expiredLinks: purgeTokens\(app\) \+ purgeBookingTokens\(app\)/)
  })

  it('describes erasure as the code does it: by hand, for one address, with notes, links and e-mail log, leaving a history without a person', () => {
    expect(bookingText('hu')).toMatch(/A törlést a tulajdonos kézzel[^.]*nem azonnal és nem automatikusan/)
    expect(bookingText('en')).toMatch(/deletes by hand[^.]*not immediate and not automatic/)
    expect(bookingText('nl')).toMatch(/met de hand[^.]*niet meteen en niet automatisch/)
    // No page or endpoint lets a visitor erase anything: the only code that does it is the maintenance module, the command line and the retention task.
    const users = sources(join(ROOT, 'server', 'src'))
      .filter((file) => /\beraseByEmail\b/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(join(ROOT, 'server', 'src'), file).split(sep).join('/'))
      .sort()
    expect(users).toEqual(['cli.ts', 'modules/system/maintenance.ts'])
    expect(read('server/src/modules/system/maintenance.ts')).toMatch(/const bookings = deleteBookingsByEmail\(app, address\)/)
    expect(read('server/src/modules/bookings/retention.ts')).toContain('DELETE FROM bookings WHERE id = ?')
    // The history is append-only and holds no person (the database refuses to change it).
    expect(read('server/src/db/migrations/0011_consultation_booking.sql')).toMatch(/booking_events_no_update BEFORE UPDATE/)
  })

  it('says the owner\'s private notes are not shown to the customer, and the code never reads them for the customer', () => {
    expect(bookingText('hu')).toMatch(/nem jelennek meg a foglalásod oldalán, és nem kerülnek bele az e-mailekbe/)
    expect(bookingText('en')).toMatch(/not shown on your booking page and are not put in the emails/)
    expect(bookingText('nl')).toMatch(/staan niet op de pagina van je afspraak en komen niet in de e-mails/)
    // Nothing says a customer sees them.
    for (const lang of LANGUAGES) expect(bookingText(lang)).not.toMatch(/(jegyzet|notes|notities)[^.]{0,40}(látható|látod|you can see|you see|zie je|zichtbaar)/i)
    // The table is read in one place on the server (the administration's detail), never by the customer's page, the public endpoints or an e-mail.
    const readers = sources(join(ROOT, 'server', 'src'))
      .filter((file) => /\bbooking_notes\b/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(join(ROOT, 'server', 'src'), file).split(sep).join('/'))
      .sort()
    expect(readers).toEqual(['modules/bookings/admin.ts'])
    // (Comments are left out: the templates' own header states the rule in words.)
    const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const file of ['server/src/modules/bookings/customer.ts', 'server/src/modules/bookings/public.ts', 'server/src/modules/bookings/mail.ts', 'server/src/modules/notifications/bookingTemplates.ts']) {
      expect(withoutComments(read(file)), file).not.toMatch(/booking_notes|\bnotes\b/)
    }
  })

  it('says only a fingerprint of the secure link is stored, and the code stores only that', () => {
    const migration = read('server/src/db/migrations/0011_consultation_booking.sql')
    const tokens = /CREATE TABLE booking_tokens \(([\s\S]*?)\n\);/.exec(migration)![1]
    expect(tokens).toMatch(/token_hash TEXT NOT NULL UNIQUE/)
    expect(tokens).not.toMatch(/^\s+token\s/m)
    const repository = read('server/src/modules/bookings/repository.ts')
    expect(repository).toMatch(/sha256Hex\(token\)/)
    expect(repository).toMatch(/INSERT INTO booking_tokens \(id, token_hash, booking_id/)
    // The link is minted when the message is written and is never stored with the message.
    expect(read('server/src/modules/bookings/mail.ts')).toMatch(/newBookingToken|mintBookingToken|createBookingToken/)
  })

  it('does not say a message arrived because it was queued or accepted: it says what the log records, and that it is not proof of arrival', () => {
    expect(bookingText('hu')).toMatch(/A napló azt rögzíti, hogy a szolgáltató elfogadta az üzenetet, nem azt, hogy a postaládádba meg is érkezett/)
    expect(bookingText('en')).toMatch(/It records that the provider accepted a message, not that it reached your mailbox/)
    expect(bookingText('nl')).toMatch(/Er staat vastgelegd dat de aanbieder een bericht accepteerde, niet dat het in je mailbox is aangekomen/)
    // No sentence promises arrival.
    for (const lang of LANGUAGES) {
      expect(noticeText(lang), lang).not.toMatch(/\b(will|always|definitely|certainly)\b[^.]{0,40}\b(arrive|reach|be delivered)\b/i)
      expect(noticeText(lang), lang).not.toMatch(/\b(mindig|biztosan)\b[^.]{0,40}(megérkezik|kézbesít)/i)
      expect(noticeText(lang), lang).not.toMatch(/\b(altijd|zeker)\b[^.]{0,40}(aan|bezorgd|afgeleverd)/i)
    }
    // The code marks a message `accepted` when the provider took it, and `delivered` only when the provider says so later (the signed webhook).
    expect(read('server/src/modules/notifications/notifier.ts')).toMatch(/CASE WHEN status = 'sending' THEN 'accepted'/)
    expect(read('server/src/modules/notifications/webhook.ts')).toMatch(/The only way a message\s+\* ever becomes `delivered`/)
  })

  it('invents no legal basis, processor agreement, certification, guarantee or encryption claim', () => {
    const everything = JSON.stringify(privacyText) + JSON.stringify(storedItems) + JSON.stringify(privacyMeta)
    expect(everything).not.toMatch(
      /legal basis|lawful|jogalap|rechtsgrond|wettelijke grondslag|data processing agreement|\bDPA\b|adatfeldolgozási (szerződés|megállapodás)|verwerkersovereenkomst|standard contractual|adequacy|ISO ?27001|SOC ?2|certified|tanúsított|gecertificeerd|encrypt|titkosít|versleutel|compliant|megfelel(ő|ünk)|conform|legally|jogilag|wettelijk/i,
    )
    expect(everything).not.toMatch(/GDPR|AVG|legitimate interest|jogos érdek|gerechtvaardigd belang|guarantee|garan/i)
  })

  it('names only the processors the code and the deployment really use, and the optional one only as optional', () => {
    for (const lang of LANGUAGES) {
      const text = recipientText(lang)
      expect(text, lang).toMatch(/Render/)
      expect(text, lang).toMatch(/Cloudflare/)
      // The e-mail service is the owner's choice and is not named (which one is live is for the owner to confirm: LAUNCH_CHECKLIST.md).
      expect(noticeText(lang), lang).not.toMatch(/Resend|SMTP|Mailgun|SendGrid|Postmark|Amazon SES|Gmail/i)
      // Cloudflare is the network the site is reached through. It does not send the site's e-mail, and Email Routing (inbound only) is not mentioned.
      for (const sentence of text.split(/(?<=[.;])\s+/).filter((part) => /Cloudflare/.test(part))) expect(sentence, lang).not.toMatch(/e-?mail|Email Routing/i)
      // Google Drive only if the owner switched backups on.
      const drive = text.split(/(?<=[.;])\s+/).find((part) => /Google Drive/.test(part))!
      expect(drive, lang).toMatch(lang === 'hu' ? /^Ha / : lang === 'en' ? /^If / : /^Heeft /)
    }
    // The code: the backup exists only when every credential is set, and the backups are deleted after their own retention.
    expect(read('server/src/config.ts')).toMatch(/enabled: backupParts\.every\(Boolean\)/)
    expect(read('server/src/modules/backups/googleDrive.ts')).toMatch(/config\.backup\.retentionDays/)
    // The only outgoing e-mail providers the code can use.
    expect(read('server/src/config.ts')).toMatch(/provider: 'none' \| 'smtp' \| 'file' \| 'resend'/)
  })

  it('says the visitors\' assistant cannot reach bookings, and its code has no way to', () => {
    expect(recipientText('en')).toMatch(/Control Room AI has no access to bookings/)
    // The administrators' own copilot (PROMPT 31, `ai/adminassistant/`) reads bookings with the administrator's permission, and the notice says so (the item before this
    // one). The visitors' assistant is everything else under `ai/`, and it must stay unable to.
    const aiRoot = join(ROOT, 'server', 'src', 'modules', 'ai')
    const visitors = sources(aiRoot).filter((file) => !relative(aiRoot, file).split(sep).includes('adminassistant'))
    expect(visitors.length).toBeGreaterThan(5)
    // No import from the bookings module, no consultation, no SQL on the booking tables. (The word "booking" itself is allowed since PROMPT 30: it is
    // one of the PROJECT TYPES a visitor can say they want built, "a booking platform", in the discovery vocabulary: data, not the consultation bookings.)
    for (const file of visitors) expect(readFileSync(file, 'utf8'), file).not.toMatch(/\bfrom\s+['"][^'"]*\/bookings\/|consultation|\bbookings\b|\bbooking_(changes|events|notes|tokens)\b/i)
    // And the visitors' tools cannot reach the administrators': the only files of the visitors' side that import the administrators' module are the gateway (which
    // keeps the two entry points apart), the statistics and the settings (which filter and switch), never the tool sets.
    const importing = visitors.filter((file) => /from\s+['"][^'"]*\/adminassistant\//.test(readFileSync(file, 'utf8'))).map((file) => relative(aiRoot, file).split(sep).join('/'))
    expect(importing.every((file) => ['admin.ts', 'gateway.ts', 'settings.ts'].includes(file)), importing.join(', ')).toBe(true)
    expect(readFileSync(join(aiRoot, 'tools.ts'), 'utf8')).not.toMatch(/adminassistant/)
  })

  it('says the booking form keeps what is typed in memory, and the code writes none of it to browser storage', () => {
    for (const file of ['components/consultation/BookingFlow.tsx', 'booking/api.ts', 'booking/hooks.ts', 'booking/useMonthDays.ts', 'pages/BookingPage.tsx', 'pages/ConsultationPage.tsx']) {
      expect(read(`src/${file}`), file).not.toMatch(/\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/)
    }
    expect(STORAGE_USERS.some((file) => /booking|consultation/i.test(file))).toBe(false)
    // The calendar asks for a type and a range of dates, and nothing about the visitor.
    expect(read('src/booking/api.ts')).toMatch(/\/api\/consultations\/types\/\$\{enc\(type\)\}\/days\?from=\$\{from\}&to=\$\{to\}/)
  })

  it('uses the glossary words of the booking in every language', () => {
    expect(bookingText('hu')).toMatch(/konzultáció/)
    expect(bookingText('hu')).toMatch(/foglalás/)
    expect(bookingText('en')).toMatch(/consultation/)
    expect(bookingText('en')).toMatch(/booking/)
    expect(bookingText('nl')).toMatch(/adviesgesprek/)
    expect(bookingText('nl')).toMatch(/afspraak/)
    // Not the words the glossary forbids in these texts (the i18n check enforces it; this keeps the notice honest if the check's scope ever changes).
    expect(noticeText('en')).not.toMatch(/\bappointments?\b|\breservations?\b/i)
    expect(noticeText('nl')).not.toMatch(/\bboeking|\breservering|\bconsult(en)?\b/i)
  })

  it('has a description of its own that no longer says there are no cookies, because there is one', () => {
    for (const lang of LANGUAGES) {
      expect(privacyMeta.description[lang]).not.toMatch(/sütik nincsenek|no cookies|geen cookies/i)
      expect(privacyMeta.description[lang].length).toBeGreaterThan(80)
    }
    expect(privacyMeta.description.hu).toMatch(/konzultációfoglalás/)
    expect(privacyMeta.description.en).toMatch(/consultation booking/)
    expect(privacyMeta.description.nl).toMatch(/adviesgesprek/)
  })
})

describe('the privacy notice and the client portal (PROMPT 25)', () => {
  const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8')
  const portalText = (lang: Language) => privacyText.portal.items.map((item) => item[lang]).join(' ')

  it('names the portal’s sign-in cookie exactly as the server sets it, and says it is used for nothing else', () => {
    const server = read('server/src/modules/customers/sessions.ts')
    expect(server).toContain("'__Host-cc_client' : 'cc_client'")
    for (const lang of LANGUAGES) {
      expect(privacyText.cookiesPortal[lang], lang).toContain('cc_client')
      expect(privacyText.cookiesPortal[lang].length).toBeGreaterThan(150)
    }
    // The website's own code still sets exactly one cookie; the notice says the second one is the server's.
    expect(storedItems.filter((item) => item.where === 'cookie').map((item) => item.name)).toEqual(['cc_lang'])
  })

  it('says only what the code does: no password, no network address in the history, no file shared, no deletion by age', () => {
    const migration = read('server/src/db/migrations/0012_client_portal.sql')
    const customers = /CREATE TABLE customers \([\s\S]*?\n\);/.exec(migration)?.[0] ?? ''
    expect(customers).not.toMatch(/password/i)
    const audit = /CREATE TABLE customer_audit_events \([\s\S]*?\n\);/.exec(migration)?.[0] ?? ''
    // No column of the history is an address, a name, a token or a network address (the event kinds are words, and may name an e-mail change).
    expect(audit).not.toMatch(/^\s+(ip|ip_hash|email|name|address|token)\w*\s+TEXT/im)
    expect(migration).toContain('CHECK (published_at IS NULL OR storage_key IS NOT NULL)')
    const retention = read('server/src/modules/system/maintenance.ts')
    expect(retention).not.toMatch(/DELETE FROM customers/)
    expect(portalText('en')).toMatch(/no password/)
    expect(portalText('en')).toMatch(/stores no file shared with you/)
    expect(portalText('en')).toMatch(/Time does not delete an account/)
  })

  it('gives no retention period, legal basis, processor, guarantee or encryption claim, in any language', () => {
    for (const lang of LANGUAGES) {
      const text = `${portalText(lang)} ${privacyText.cookiesPortal[lang]}`
      expect(text, lang).not.toMatch(/\d+\s*(days?|weeks?|months?|years?|nap|hét|hónap|év|dagen|weken|maanden|jaar)/i)
      expect(text, lang).not.toMatch(/GDPR|AVG|legal basis|jogalap|rechtsgrond|guarantee|garantál|garandeer|encrypt|titkosít|versleutel|certif|SLA/i)
      expect(text, lang).not.toMatch(/Resend|Google|Brevo|Mailgun|SendGrid|Postmark/)
    }
  })

  it('never says a message arrived because the provider accepted it', () => {
    expect(portalText('en')).toMatch(/does not mean the email reached your mailbox/)
    expect(portalText('hu')).toMatch(/nem azt jelenti, hogy a levél megérkezett/)
    expect(portalText('nl')).toMatch(/betekent niet dat de e-mail in je mailbox is aangekomen/)
  })

  it('is on the privacy page in every language', () => {
    const page = read('src/pages/PrivacyPage.tsx')
    expect(page).toContain('text.portal.items.map')
    expect(page).toContain('text.cookiesPortal[lang]')
  })
})
