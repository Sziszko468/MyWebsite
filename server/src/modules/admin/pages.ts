import type { SessionInfo } from '../../context.ts'
import { LANGUAGES } from '../../config.ts'
import { html, joinHtml, raw, type Raw } from '../../lib/html.ts'
import { can } from '../auth/permissions.ts'
import type { Catalog, ContentRecord, ExtraRecord, PackageRecord, ServiceRecord } from '../catalog/repository.ts'
import { CURRENCIES, NEEDS, VAT_MODES } from '../catalog/repository.ts'
import { INQUIRY_KINDS, INQUIRY_STATUSES, type InquiryRow, type NoteRow } from '../inquiries/repository.ts'
import { QUOTE_STATUSES, type ItemView, type QuoteRow } from '../quotes/repository.ts'
import type { Totals } from '../shop/pricing.ts'
import type { AuditEntry } from '../system/audit.ts'
import type { DeliveryRow } from '../notifications/notifier.ts'
import { checkbox, csrfInput, dateText, field, layout, maskAddress, pager, select, statusBadge, textarea } from './layout.ts'

/** The admin's screens. Each returns a whole HTML page as a string; none of them does anything but show what it is given. */

type Values = Record<string, string | string[]>
const one = (values: Values, name: string): string => {
  const value = values[name]
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '')
}
const many = (values: Values, name: string): string[] => {
  const value = values[name]
  return Array.isArray(value) ? value : value ? [value] : []
}

// ---- sign in ---------------------------------------------------------------------------------------------------------

export function loginPage(csrf: string, error: boolean): string {
  return layout({
    title: 'Sign in',
    session: null,
    body: html`<div class="login card"><h1>Sign in</h1>
      ${error ? html`<p class="flash error" role="alert">The e-mail address or password is not correct, or the account is temporarily locked.</p>` : ''}
      <form method="post" action="/admin/login">
        <input type="hidden" name="_csrf" value="${csrf}">
        ${field({ name: 'email', label: 'E-mail address', type: 'email', required: true, id: 'login-email' })}
        ${field({ name: 'password', label: 'Password', type: 'password', required: true, id: 'login-password' })}
        <p><button type="submit">Sign in</button></p>
      </form></div>`,
  })
}

// ---- dashboard -------------------------------------------------------------------------------------------------------

export interface DashboardData {
  inquiries: { byStatus: Record<string, number>; archived: number; total: number; last7: number; last30: number; recent: InquiryRow[] }
  quotes: { byStatus: Record<string, number>; archived: number; total: number; last7: number; last30: number; recent: QuoteRow[] }
  email: { enabled: boolean; provider: string; pending: number; failed: number; accepted: number }
}

export function dashboardPage(session: SessionInfo, data: DashboardData, flash: string | null): string {
  const statusList = (counts: Record<string, number>, order: readonly string[]) =>
    joinHtml(order.map((status) => html`<li>${statusBadge(status)} ${counts[status] ?? 0}</li>`))
  return layout({
    title: 'Dashboard',
    session,
    path: '/admin/dashboard',
    flash,
    body: html`<h1>Dashboard</h1>
      <div class="grid">
        <section class="card"><h2>Messages</h2><p class="stat">${data.inquiries.byStatus.new ?? 0}</p><p class="muted">new, of ${data.inquiries.total} in total (${data.inquiries.archived} archived)</p>
          <p class="muted">Received: ${data.inquiries.last7} in the last 7 days, ${data.inquiries.last30} in the last 30.</p>
          <ul>${statusList(data.inquiries.byStatus, INQUIRY_STATUSES)}</ul></section>
        <section class="card"><h2>Quote requests</h2><p class="stat">${data.quotes.byStatus.new ?? 0}</p><p class="muted">new, of ${data.quotes.total} in total (${data.quotes.archived} archived)</p>
          <p class="muted">Received: ${data.quotes.last7} in the last 7 days, ${data.quotes.last30} in the last 30.</p>
          <ul>${statusList(data.quotes.byStatus, QUOTE_STATUSES)}</ul></section>
        <section class="card"><h2>E-mail</h2>
          ${data.email.enabled ? html`<p>Provider: <strong>${data.email.provider}</strong></p><p class="muted">${data.email.accepted} accepted by the provider, ${data.email.pending} waiting, ${data.email.failed} failed. “Accepted” means the mail server took the message, not that it reached an inbox.</p>` : html`<p>E-mail is not configured. Messages are stored here; nobody is notified.</p>`}
        </section>
      </div>
      <h2>Latest messages</h2>${inquiryTable(data.inquiries.recent)}
      <h2>Latest quote requests</h2>${quoteTable(data.quotes.recent)}`,
  })
}

// ---- messages --------------------------------------------------------------------------------------------------------

function inquiryTable(rows: readonly InquiryRow[]): Raw {
  if (rows.length === 0) return html`<p class="muted">Nothing yet.</p>`
  return html`<div class="scroll"><table><thead><tr><th>Received</th><th>Reference</th><th>From</th><th>Subject</th><th>Status</th></tr></thead><tbody>
    ${joinHtml(rows.map((row) => html`<tr><td>${dateText(row.created_at)}</td><td><a href="/admin/inquiries/${row.id}">${row.reference}</a></td><td>${row.name}</td><td>${row.subject}</td><td>${statusBadge(row.status)}${row.archived_at ? html` <span class="badge">archived</span>` : ''}</td></tr>`))}
  </tbody></table></div>`
}

function searchForm(action: string, query: URLSearchParams, statuses: readonly string[], extra: Raw | string = ''): Raw {
  return html`<form class="card row" method="get" action="${action}">
    <div><label for="q">Search</label><input id="q" type="search" name="q" value="${query.get('q') ?? ''}"></div>
    <div><label for="status">Status</label><select id="status" name="status"><option value="">All</option>${joinHtml(statuses.map((status) => html`<option value="${status}"${query.get('status') === status ? raw(' selected') : ''}>${status.replace(/_/g, ' ')}</option>`))}</select></div>
    ${extra}
    <div><label for="archived">Show</label><select id="archived" name="archived"><option value="">Working list</option><option value="only"${query.get('archived') === 'only' ? raw(' selected') : ''}>Archive</option><option value="all"${query.get('archived') === 'all' ? raw(' selected') : ''}>Everything</option></select></div>
    <div><button type="submit">Filter</button></div></form>`
}

export function inquiriesPage(session: SessionInfo, data: { rows: InquiryRow[]; total: number; page: number; pageSize: number; query: URLSearchParams }, flash: string | null): string {
  const kinds = html`<div><label for="kind">Topic</label><select id="kind" name="kind"><option value="">All</option>${joinHtml(INQUIRY_KINDS.map((kind) => html`<option value="${kind}"${data.query.get('kind') === kind ? raw(' selected') : ''}>${kind}</option>`))}</select></div>`
  return layout({
    title: 'Messages',
    session,
    path: '/admin/inquiries',
    flash,
    body: html`<h1>Messages</h1>${searchForm('/admin/inquiries', data.query, INQUIRY_STATUSES, kinds)}${inquiryTable(data.rows)}${pager('/admin/inquiries', data.query, data.page, data.total, data.pageSize)}`,
  })
}

function notesBlock(notes: readonly NoteRow[]): Raw {
  return notes.length === 0
    ? html`<p class="muted">No notes yet.</p>`
    : html`<ul>${joinHtml(notes.map((note) => html`<li><span class="muted">${dateText(note.created_at)} · ${note.author_email ?? 'removed account'}</span><pre class="text">${note.body}</pre></li>`))}</ul>`
}

function statusForm(action: string, session: SessionInfo, statuses: readonly string[], current: string, notifyEnabled: boolean): Raw {
  return html`<form method="post" action="${action}" class="card">${csrfInput(session.csrfToken)}
    <div class="row">${select({ name: 'status', label: 'Status', value: current, choices: statuses.map((status) => [status, status.replace(/_/g, ' ')] as const) })}</div>
    ${checkbox('notify', notifyEnabled ? 'E-mail the sender about this change' : 'E-mail the sender (e-mail is not configured: nothing will be sent)', false)}
    ${textarea({ name: 'note', label: 'Message to include in that e-mail (optional, the sender sees it)', rows: 3 })}
    <p><button type="submit">Change status</button></p></form>`
}

export function inquiryPage(session: SessionInfo, data: { inquiry: InquiryRow; notes: NoteRow[] }, notifyEnabled: boolean, flash: string | null): string {
  const { inquiry, notes } = data
  const base = `/admin/inquiries/${inquiry.id}`
  return layout({
    title: `Message ${inquiry.reference}`,
    session,
    path: '/admin/inquiries',
    flash,
    body: html`<p><a href="/admin/inquiries">← Messages</a></p><h1>${inquiry.subject}</h1>
      <div class="card"><dl class="meta">
        <dt>Reference</dt><dd>${inquiry.reference}</dd><dt>Status</dt><dd>${statusBadge(inquiry.status)}${inquiry.archived_at ? html` <span class="badge">archived ${dateText(inquiry.archived_at)}</span>` : ''}</dd>
        <dt>From</dt><dd>${inquiry.name} &lt;<a href="mailto:${inquiry.email}">${inquiry.email}</a>&gt;</dd><dt>Topic</dt><dd>${inquiry.kind}</dd><dt>Language</dt><dd>${inquiry.language}</dd>
        <dt>Received</dt><dd>${dateText(inquiry.created_at)} UTC</dd><dt>Consent given</dt><dd>${inquiry.consent_at ? dateText(inquiry.consent_at) : 'not recorded'}</dd></dl>
        <h2>Message</h2><pre class="text">${inquiry.message}</pre></div>
      <h2>Status</h2>${statusForm(`${base}/status`, session, INQUIRY_STATUSES, inquiry.status, notifyEnabled)}
      <h2>Internal notes</h2>${notesBlock(notes)}
      <form method="post" action="${base}/notes" class="card">${csrfInput(session.csrfToken)}${textarea({ name: 'body', label: 'Add a note (only administrators see it)', rows: 3 })}<p><button type="submit">Add note</button></p></form>
      <h2>Archive</h2>
      <form method="post" action="${base}/archive" class="card">${csrfInput(session.csrfToken)}<input type="hidden" name="archived" value="${inquiry.archived_at ? 'false' : 'true'}"><button class="secondary" type="submit">${inquiry.archived_at ? 'Move back to the working list' : 'Archive'}</button></form>
      ${can(session.role, 'requests:delete') ? html`<h2>Delete</h2><form method="post" action="${base}/delete" class="card">${csrfInput(session.csrfToken)}<p class="muted">Deleting removes the message, its notes and its e-mail log for good.</p>${checkbox('confirm', 'I understand this cannot be undone', false, 'yes')}<p><button class="danger" type="submit">Delete permanently</button></p></form>` : ''}`,
  })
}

// ---- quote requests --------------------------------------------------------------------------------------------------

function quoteTable(rows: readonly QuoteRow[]): Raw {
  if (rows.length === 0) return html`<p class="muted">Nothing yet.</p>`
  return html`<div class="scroll"><table><thead><tr><th>Received</th><th>Reference</th><th>From</th><th>Status</th></tr></thead><tbody>
    ${joinHtml(rows.map((row) => html`<tr><td>${dateText(row.created_at)}</td><td><a href="/admin/quote-requests/${row.id}">${row.reference}</a></td><td>${row.name}</td><td>${statusBadge(row.status)}${row.archived_at ? html` <span class="badge">archived</span>` : ''}</td></tr>`))}
  </tbody></table></div>`
}

export function quotesPage(session: SessionInfo, data: { rows: QuoteRow[]; total: number; page: number; pageSize: number; query: URLSearchParams }, flash: string | null): string {
  const exportLink = html`<a class="button secondary" href="/admin/quote-requests/export.csv?${data.query.toString()}">Export this list (CSV)</a>`
  return layout({
    title: 'Quote requests',
    session,
    path: '/admin/quote-requests',
    flash,
    body: html`<h1>Quote requests</h1>${searchForm('/admin/quote-requests', data.query, QUOTE_STATUSES)}<p>${exportLink}</p>${quoteTable(data.rows)}${pager('/admin/quote-requests', data.query, data.page, data.total, data.pageSize)}`,
  })
}

function priceText(totals: Totals): string {
  if (totals.fixed.length === 0) return 'No part has a published price: everything is for a custom quote.'
  return `${totals.fixed.map((sum) => `${sum.amount} ${sum.currency} (${sum.vat})`).join(', ')} published; ${totals.quotedParts} part(s) to be quoted.`
}

export function quotePage(session: SessionInfo, data: { quote: QuoteRow; items: ItemView[]; notes: NoteRow[]; pricing: Totals }, notifyEnabled: boolean, flash: string | null): string {
  const { quote, items, notes, pricing } = data
  const base = `/admin/quote-requests/${quote.id}`
  return layout({
    title: `Quote request ${quote.reference}`,
    session,
    path: '/admin/quote-requests',
    flash,
    body: html`<p><a href="/admin/quote-requests">← Quote requests</a></p><h1>Quote request ${quote.reference}</h1>
      <div class="card"><dl class="meta">
        <dt>Status</dt><dd>${statusBadge(quote.status)}${quote.archived_at ? html` <span class="badge">archived ${dateText(quote.archived_at)}</span>` : ''}</dd>
        <dt>From</dt><dd>${quote.name} &lt;<a href="mailto:${quote.email}">${quote.email}</a>&gt;${quote.phone ? html`, ${quote.phone}` : ''}</dd>
        <dt>Language</dt><dd>${quote.language}</dd><dt>Received</dt><dd>${dateText(quote.created_at)} UTC</dd><dt>Consent given</dt><dd>${quote.consent_at ? dateText(quote.consent_at) : 'not recorded'}</dd>
        <dt>Objective</dt><dd>${quote.objective ?? '—'}</dd><dt>Timing</dt><dd>${quote.timing ?? '—'}</dd></dl></div>
      <h2>Selected services</h2>
      <div class="scroll"><table><thead><tr><th>Need</th><th>Service</th><th>Package</th><th>Add-ons</th><th>Price at the time</th></tr></thead><tbody>
        ${joinHtml(items.map((item) => html`<tr><td>${item.need}</td><td>${item.service ?? '—'}</td><td>${item.package ?? 'custom project'}</td><td>${item.extras.join(', ') || '—'}</td><td>${itemPrice(item)}</td></tr>`))}
      </tbody></table></div>
      <p class="muted">${priceText(pricing)}</p>
      <h2>Project description</h2><div class="card"><pre class="text">${quote.description}</pre></div>
      ${quote.requirements ? html`<h2>Further requirements</h2><div class="card"><pre class="text">${quote.requirements}</pre></div>` : ''}
      ${quote.reference_notes ? html`<h2>References</h2><div class="card"><pre class="text">${quote.reference_notes}</pre></div>` : ''}
      <p><a class="button secondary" href="${base}/export.json">Export this request (JSON)</a></p>
      <h2>Status</h2>${statusForm(`${base}/status`, session, QUOTE_STATUSES, quote.status, notifyEnabled)}
      <h2>Internal notes</h2>${notesBlock(notes)}
      <form method="post" action="${base}/notes" class="card">${csrfInput(session.csrfToken)}${textarea({ name: 'body', label: 'Add a note (only administrators see it)', rows: 3 })}<p><button type="submit">Add note</button></p></form>
      <h2>Archive</h2>
      <form method="post" action="${base}/archive" class="card">${csrfInput(session.csrfToken)}<input type="hidden" name="archived" value="${quote.archived_at ? 'false' : 'true'}"><button class="secondary" type="submit">${quote.archived_at ? 'Move back to the working list' : 'Archive'}</button></form>
      ${can(session.role, 'requests:delete') ? html`<h2>Delete</h2><form method="post" action="${base}/delete" class="card">${csrfInput(session.csrfToken)}<p class="muted">Deleting removes the request, its items, notes and e-mail log for good.</p>${checkbox('confirm', 'I understand this cannot be undone', false, 'yes')}<p><button class="danger" type="submit">Delete permanently</button></p></form>` : ''}`,
  })
}

function itemPrice(item: ItemView): string {
  const part = (code: string, price: { kind: string; amount?: number; currency?: string }) => (price.kind === 'from' ? `${code}: ${price.amount} ${price.currency}` : `${code}: quote`)
  const parts = [item.snapshot.plan ? part(item.snapshot.plan.code, item.snapshot.plan.price) : 'custom: quote', ...item.snapshot.extras.map((extra) => part(extra.code, extra.price))]
  return parts.join('; ')
}

// ---- catalogue -------------------------------------------------------------------------------------------------------

const statusChoices = [['active', 'Active'], ['disabled', 'Disabled']] as const

export function catalogPage(session: SessionInfo, catalog: Catalog, flash: string | null): string {
  const first = (translations: Record<string, { title?: string; name?: string } | undefined>) => translations.hu?.title ?? translations.hu?.name ?? '—'
  const rows = <T extends { status: string }>(items: readonly T[], href: (item: T) => string, label: (item: T) => string, extra: (item: T) => string) =>
    joinHtml(items.map((item) => html`<tr><td><a href="${href(item)}">${label(item)}</a></td><td>${extra(item)}</td><td>${statusBadge(item.status, 'never')}</td></tr>`))
  const priceOf = (price: { kind: string; amount?: number; currency?: string }) => (price.kind === 'from' ? `from ${price.amount} ${price.currency}` : price.kind)
  return layout({
    title: 'Catalogue',
    session,
    path: '/admin/catalog',
    flash,
    body: html`<h1>Catalogue</h1>
      <p class="muted">The API, and the checks on every quote request, use this data at once. The website takes the prices and texts of the packages and add-ons it already has, and the FAQ, at its next build (<code>npm run catalog:pull</code>, then a rebuild). Which packages, add-ons and services exist is part of the website's source: disabling one here stops the backend accepting requests for it, but the website keeps showing it until it is removed there too. Rows that requests refer to are disabled rather than deleted.</p>
      <h2>Services</h2><div class="scroll"><table><thead><tr><th>Service</th><th>Category</th><th>Status</th></tr></thead><tbody>${rows(catalog.services, (s) => `/admin/services/${s.slug}`, (s) => `${first(s.translations)} (${s.slug})`, (s) => s.category)}</tbody></table></div>
      <p><a class="button secondary" href="/admin/services/new">New service</a></p>
      <h2>Packages</h2><div class="scroll"><table><thead><tr><th>Package</th><th>Price</th><th>Status</th></tr></thead><tbody>${rows(catalog.packages, (p) => `/admin/packages/${p.code}`, (p) => `${first(p.translations)} (${p.code})`, (p) => priceOf(p.price))}</tbody></table></div>
      <p><a class="button secondary" href="/admin/packages/new">New package</a></p>
      <h2>Add-ons</h2><div class="scroll"><table><thead><tr><th>Add-on</th><th>Price</th><th>Status</th></tr></thead><tbody>${rows(catalog.extras, (e) => `/admin/extras/${e.code}`, (e) => `${first(e.translations)} (${e.code})`, (e) => priceOf(e.price))}</tbody></table></div>
      <p><a class="button secondary" href="/admin/extras/new">New add-on</a></p>
      <h2>Content</h2><div class="scroll"><table><thead><tr><th>Block</th><th>Type</th><th>Status</th></tr></thead><tbody>${rows(catalog.content, (c) => `/admin/content/${c.type}/${c.slug}`, (c) => `${first(c.translations)} (${c.slug})`, (c) => c.type)}</tbody></table></div>
      <p><a class="button secondary" href="/admin/content/faq/new">New FAQ entry</a></p>`,
  })
}

function translationFields(spec: readonly { name: string; label: string; kind: 'line' | 'block' | 'list' }[], values: Values, errors: Record<string, string>): Raw {
  return joinHtml(
    LANGUAGES.map(
      (language) => html`<fieldset><legend>${language.toUpperCase()}</legend>${joinHtml(
        spec.map((item) => {
          const name = `${item.name}_${language}`
          return item.kind === 'line'
            ? field({ name, label: item.label, value: one(values, name), errors })
            : textarea({ name, label: item.label, value: one(values, name), errors, rows: item.kind === 'list' ? 5 : 4, hint: item.kind === 'list' ? 'One item per line.' : undefined })
        }),
      )}</fieldset>`,
    ),
  )
}

function priceFields(values: Values, errors: Record<string, string>): Raw {
  return html`<fieldset><legend>Price</legend>
    ${select({ name: 'price_kind', label: 'How it is priced', value: one(values, 'price_kind') || 'quote', choices: [['quote', 'Custom quote (no published price)'], ['tbd', 'Not decided yet'], ['from', 'A published starting price']], errors })}
    <div class="row">${field({ name: 'price_amount', label: 'Amount (whole currency units)', value: one(values, 'price_amount'), type: 'number', errors })}
    ${select({ name: 'price_currency', label: 'Currency', value: one(values, 'price_currency') || 'EUR', choices: CURRENCIES.map((c) => [c, c] as const), errors })}
    ${select({ name: 'vat', label: 'VAT', value: one(values, 'vat') || 'unspecified', choices: VAT_MODES.map((v) => [v, v] as const), errors })}</div>
    <p class="muted">Only a “published starting price” is shown as a price. It must say how VAT is handled. Nothing is invented: leave it as a custom quote until a price is approved.</p></fieldset>`
}

function formShell(session: SessionInfo, options: { title: string; back: string; action: string; body: Raw; deleteAction?: string; flash?: string | null; errorSummary: boolean }): string {
  return layout({
    title: options.title,
    session,
    path: '/admin/catalog',
    flash: options.flash,
    body: html`<p><a href="${options.back}">← Catalogue</a></p><h1>${options.title}</h1>
      ${options.errorSummary ? html`<p class="flash error" role="alert">Some fields are not acceptable. Nothing was saved.</p>` : ''}
      <form method="post" action="${options.action}">${csrfInput(session.csrfToken)}${options.body}<p><button type="submit">Save</button></p></form>
      ${options.deleteAction && can(session.role, 'catalog:delete') ? html`<form method="post" action="${options.deleteAction}" class="card">${csrfInput(session.csrfToken)}<p class="muted">A row that requests refer to cannot be deleted: disable it instead.</p><button class="danger" type="submit">Delete</button></form>` : ''}`,
  })
}

export function serviceValues(service: ServiceRecord | null): Values {
  const values: Values = { slug: service?.slug ?? '', category: service?.category ?? '', status: service?.status ?? 'active', position: String(service?.position ?? 0), packages: service?.packages ?? [] }
  for (const language of LANGUAGES) {
    const t = service?.translations[language]
    values[`title_${language}`] = t?.title ?? ''
    values[`summary_${language}`] = t?.summary ?? ''
    values[`tagline_${language}`] = t?.tagline ?? ''
    values[`overview_${language}`] = t?.overview ?? ''
    values[`features_${language}`] = (t?.features ?? []).join('\n')
  }
  return values
}

export function servicePage(session: SessionInfo, service: ServiceRecord | null, catalog: Catalog, values: Values, errors: Record<string, string>, flash: string | null): string {
  const creating = service === null
  return formShell(session, {
    title: creating ? 'New service' : `Service: ${service.slug}`,
    back: '/admin/catalog',
    action: creating ? '/admin/services' : `/admin/services/${service.slug}`,
    deleteAction: creating ? undefined : `/admin/services/${service.slug}/delete`,
    flash,
    errorSummary: Object.keys(errors).length > 0,
    body: html`${creating ? field({ name: 'slug', label: 'Slug (the address part, cannot be changed later)', value: one(values, 'slug'), errors, required: true }) : ''}
      ${field({ name: 'category', label: 'Category', value: one(values, 'category'), errors, required: true })}
      <div class="row">${select({ name: 'status', label: 'Status', value: one(values, 'status'), choices: statusChoices, errors })}${field({ name: 'position', label: 'Order', value: one(values, 'position'), type: 'number', errors })}</div>
      ${translationFields([{ name: 'title', label: 'Name', kind: 'line' }, { name: 'summary', label: 'Summary', kind: 'block' }, { name: 'tagline', label: 'Tagline', kind: 'line' }, { name: 'overview', label: 'Overview', kind: 'block' }, { name: 'features', label: 'Features', kind: 'list' }], values, errors)}
      <fieldset><legend>Packages offered first</legend><div class="checks">${joinHtml(catalog.packages.map((pack) => checkbox('packages', `${pack.translations.hu?.name ?? pack.code}`, many(values, 'packages').includes(pack.code), pack.code)))}</div></fieldset>`,
  })
}

export function packageValues(pack: PackageRecord | null): Values {
  const values: Values = {
    code: pack?.code ?? '', status: pack?.status ?? 'active', position: String(pack?.position ?? 0), featured: pack?.featured ? ['on'] : [], quoteRequired: pack ? (pack.quoteRequired ? ['on'] : []) : ['on'],
    price_kind: pack?.price.kind ?? 'quote', price_amount: pack?.price.kind === 'from' ? String(pack.price.amount) : '', price_currency: pack?.price.kind === 'from' ? pack.price.currency : 'EUR', vat: pack?.vat ?? 'unspecified',
    needs: pack?.needs ?? [], extras: pack?.extras ?? [],
  }
  for (const language of LANGUAGES) {
    const t = pack?.translations[language]
    values[`name_${language}`] = t?.name ?? ''
    values[`tagline_${language}`] = t?.tagline ?? ''
    values[`audience_${language}`] = t?.audience ?? ''
    values[`scope_${language}`] = t?.scope ?? ''
    values[`customization_${language}`] = t?.customization ?? ''
    values[`support_${language}`] = t?.support ?? ''
    values[`priceNote_${language}`] = t?.priceNote ?? ''
    values[`includes_${language}`] = (t?.includes ?? []).join('\n')
    values[`fits_${language}`] = (t?.fits ?? []).join('\n')
    values[`deliverables_${language}`] = (t?.deliverables ?? []).join('\n')
  }
  return values
}

export function packagePage(session: SessionInfo, pack: PackageRecord | null, catalog: Catalog, values: Values, errors: Record<string, string>, flash: string | null): string {
  const creating = pack === null
  return formShell(session, {
    title: creating ? 'New package' : `Package: ${pack.code}`,
    back: '/admin/catalog',
    action: creating ? '/admin/packages' : `/admin/packages/${pack.code}`,
    deleteAction: creating ? undefined : `/admin/packages/${pack.code}/delete`,
    flash,
    errorSummary: Object.keys(errors).length > 0,
    body: html`${creating ? field({ name: 'code', label: 'Code (cannot be changed later)', value: one(values, 'code'), errors, required: true }) : ''}
      <div class="row">${select({ name: 'status', label: 'Status', value: one(values, 'status'), choices: statusChoices, errors })}${field({ name: 'position', label: 'Order', value: one(values, 'position'), type: 'number', errors })}</div>
      <div class="checks">${checkbox('featured', 'Give this package the most weight on the page', many(values, 'featured').length > 0)}${checkbox('quoteRequired', 'The exact price is always confirmed in a quote', many(values, 'quoteRequired').length > 0)}</div>
      ${priceFields(values, errors)}
      ${translationFields([{ name: 'name', label: 'Name', kind: 'line' }, { name: 'tagline', label: 'Tagline', kind: 'line' }, { name: 'audience', label: 'Who it is for', kind: 'block' }, { name: 'scope', label: 'Scope', kind: 'block' }, { name: 'customization', label: 'Customisation', kind: 'block' }, { name: 'support', label: 'Support', kind: 'block' }, { name: 'priceNote', label: 'Note under the price (optional)', kind: 'line' }, { name: 'includes', label: 'What it can include', kind: 'list' }, { name: 'fits', label: 'Projects it suits', kind: 'list' }, { name: 'deliverables', label: 'What the client holds at the end', kind: 'list' }], values, errors)}
      <fieldset><legend>Suggested for these needs</legend><div class="checks">${joinHtml(NEEDS.map((need) => checkbox('needs', need, many(values, 'needs').includes(need), need)))}</div></fieldset>
      <fieldset><legend>Add-ons that can be put on it</legend><div class="checks">${joinHtml(catalog.extras.map((extra) => checkbox('extras', extra.translations.hu?.name ?? extra.code, many(values, 'extras').includes(extra.code), extra.code)))}</div></fieldset>`,
  })
}

export function extraValues(extra: ExtraRecord | null): Values {
  const values: Values = { code: extra?.code ?? '', status: extra?.status ?? 'active', position: String(extra?.position ?? 0), price_kind: extra?.price.kind ?? 'quote', price_amount: extra?.price.kind === 'from' ? String(extra.price.amount) : '', price_currency: extra?.price.kind === 'from' ? extra.price.currency : 'EUR', vat: extra?.vat ?? 'unspecified', appliesTo: extra?.appliesTo ?? [] }
  for (const language of LANGUAGES) {
    values[`name_${language}`] = extra?.translations[language]?.name ?? ''
    values[`summary_${language}`] = extra?.translations[language]?.summary ?? ''
  }
  return values
}

export function extraPage(session: SessionInfo, extra: ExtraRecord | null, values: Values, errors: Record<string, string>, flash: string | null): string {
  const creating = extra === null
  return formShell(session, {
    title: creating ? 'New add-on' : `Add-on: ${extra.code}`,
    back: '/admin/catalog',
    action: creating ? '/admin/extras' : `/admin/extras/${extra.code}`,
    deleteAction: creating ? undefined : `/admin/extras/${extra.code}/delete`,
    flash,
    errorSummary: Object.keys(errors).length > 0,
    body: html`${creating ? field({ name: 'code', label: 'Code (cannot be changed later)', value: one(values, 'code'), errors, required: true }) : ''}
      <div class="row">${select({ name: 'status', label: 'Status', value: one(values, 'status'), choices: statusChoices, errors })}${field({ name: 'position', label: 'Order', value: one(values, 'position'), type: 'number', errors })}</div>
      ${priceFields(values, errors)}
      ${translationFields([{ name: 'name', label: 'Name', kind: 'line' }, { name: 'summary', label: 'Summary', kind: 'block' }], values, errors)}
      <fieldset><legend>Can be added to these needs</legend><div class="checks">${joinHtml(NEEDS.map((need) => checkbox('appliesTo', need, many(values, 'appliesTo').includes(need), need)))}</div></fieldset>`,
  })
}

export function contentValues(item: ContentRecord | null, type: string): Values {
  const values: Values = { type: item?.type ?? type, slug: item?.slug ?? '', status: item?.status ?? 'active', position: String(item?.position ?? 0) }
  for (const language of LANGUAGES) {
    values[`title_${language}`] = item?.translations[language]?.title ?? ''
    values[`description_${language}`] = item?.translations[language]?.description ?? ''
  }
  return values
}

export function contentPage(session: SessionInfo, item: ContentRecord | null, type: string, values: Values, errors: Record<string, string>, flash: string | null): string {
  const creating = item === null
  const isFaq = type === 'faq'
  return formShell(session, {
    title: creating ? `New ${type} block` : `${type}: ${item.slug}`,
    back: '/admin/catalog',
    action: creating ? `/admin/content/${type}` : `/admin/content/${type}/${item.slug}`,
    deleteAction: creating ? undefined : `/admin/content/${type}/${item.slug}/delete`,
    flash,
    errorSummary: Object.keys(errors).length > 0,
    body: html`<input type="hidden" name="type" value="${type}">${creating ? field({ name: 'slug', label: 'Slug (cannot be changed later)', value: one(values, 'slug'), errors, required: true }) : ''}
      <div class="row">${select({ name: 'status', label: 'Status', value: one(values, 'status'), choices: statusChoices, errors })}${field({ name: 'position', label: 'Order', value: one(values, 'position'), type: 'number', errors })}</div>
      ${translationFields([{ name: 'title', label: isFaq ? 'Question' : 'Title', kind: 'line' }, { name: 'description', label: isFaq ? 'Answer' : 'Text', kind: 'block' }], values, errors)}`,
  })
}

// ---- system and account ----------------------------------------------------------------------------------------------

export interface SystemData {
  config: Record<string, unknown>
  migrations: { current: number; latest: number; pending: number }
  stats: { startedAt: number; requests: number; clientErrors: number; serverErrors: number; rateLimited: number }
  email: { enabled: boolean; provider: string; pending: number; failed: number; accepted: number; lastFailure: { at: string; error: string } | null }
  failedDeliveries: DeliveryRow[]
  audit: AuditEntry[]
  hasDeployHook: boolean
}

export function systemPage(session: SessionInfo, data: SystemData, flash: string | null): string {
  return layout({
    title: 'System',
    session,
    path: '/admin/system',
    flash,
    body: html`<h1>System</h1>
      <div class="grid">
        <section class="card"><h2>Server</h2><dl class="meta"><dt>Schema version</dt><dd>${data.migrations.current} of ${data.migrations.latest}${data.migrations.pending ? ' (migrations pending)' : ''}</dd>
          <dt>Running since</dt><dd>${new Date(data.stats.startedAt).toISOString().replace('T', ' ').slice(0, 16)} UTC</dd><dt>Requests</dt><dd>${data.stats.requests}</dd>
          <dt>Client errors (4xx)</dt><dd>${data.stats.clientErrors}</dd><dt>Server errors (5xx)</dt><dd>${data.stats.serverErrors}</dd><dt>Rate limited</dt><dd>${data.stats.rateLimited}</dd></dl>
          <p class="muted">Counters since the process started.</p></section>
        <section class="card"><h2>E-mail</h2><dl class="meta"><dt>Provider</dt><dd>${data.email.provider}</dd><dt>Accepted</dt><dd>${data.email.accepted}</dd><dt>Waiting</dt><dd>${data.email.pending}</dd><dt>Failed</dt><dd>${data.email.failed}</dd></dl>
          ${data.email.lastFailure ? html`<p class="muted">Last failure ${dateText(data.email.lastFailure.at)}: ${data.email.lastFailure.error}</p>` : ''}</section>
      </div>
      <h2>Configuration (no secrets)</h2><div class="card"><pre class="text">${JSON.stringify(data.config, null, 2)}</pre></div>
      ${data.failedDeliveries.length > 0 ? html`<h2>Failed e-mails</h2><div class="scroll"><table><thead><tr><th>When</th><th>Kind</th><th>To</th><th>Attempts</th><th>Last error</th></tr></thead><tbody>${joinHtml(data.failedDeliveries.map((row) => html`<tr><td>${dateText(row.updated_at)}</td><td>${row.kind}</td><td>${maskAddress(row.recipient)}</td><td>${row.attempts}</td><td>${row.last_error ?? ''}</td></tr>`))}</tbody></table></div>` : ''}
      <h2>Housekeeping</h2>
      <form method="post" action="/admin/system/maintenance" class="card">${csrfInput(session.csrfToken)}<p>Remove expired sessions and, if a retention period is configured, finished requests older than it.</p><button class="secondary" type="submit">Run maintenance</button></form>
      <form method="post" action="/admin/system/publish" class="card">${csrfInput(session.csrfToken)}<p>${data.hasDeployHook ? 'Ask the host to rebuild the public website, so it shows the catalogue as it is now.' : 'No publish hook is configured (DEPLOY_HOOK_URL). Rebuild the website by hand: npm run catalog:pull, then npm run build.'}</p>${data.hasDeployHook ? html`<button type="submit">Publish the website</button>` : ''}</form>
      <h2>Recent administrator actions</h2><div class="scroll"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th></tr></thead><tbody>${joinHtml(data.audit.map((entry) => html`<tr><td>${dateText(entry.created_at)}</td><td>${entry.actor ?? '—'}</td><td>${entry.action}</td><td>${entry.entity_type} ${entry.entity_id ?? ''}</td></tr>`))}</tbody></table></div>`,
  })
}

export function accountPage(session: SessionInfo, error: string | null, flash: string | null): string {
  return layout({
    title: 'Account',
    session,
    flash,
    body: html`<h1>Account</h1><p>${session.email} (${session.role})</p>
      <form method="post" action="/admin/account/password" class="card"><h2>Change password</h2>${csrfInput(session.csrfToken)}
        ${error ? html`<p class="flash error" role="alert">${error}</p>` : ''}
        ${field({ name: 'current', label: 'Current password', type: 'password', required: true })}${field({ name: 'next', label: 'New password (at least 12 characters)', type: 'password', required: true })}
        <p><button type="submit">Change password</button></p></form>`,
  })
}

export function errorPage(session: SessionInfo | null, status: number, message: string): string {
  return layout({ title: `Error ${status}`, session, body: html`<h1>${message}</h1><p><a href="/admin/dashboard">Back to the dashboard</a></p>` })
}
