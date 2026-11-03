import type { SessionInfo } from '../../context.ts'
import { escapeHtml, html, joinHtml, raw, type Part, type Raw } from '../../lib/html.ts'
import { can } from '../auth/permissions.ts'

/**
 * The admin's page frame and the small pieces every page is made of. Everything is plain HTML with one stylesheet
 * (served from /admin/assets/admin.css: the admin's Content-Security-Policy allows no script and no inline style),
 * so a page works in any browser and has nothing to attack. Values go through `html` (lib/html.ts), which escapes.
 */

export const FLASH: Record<string, { text: string; tone: 'ok' | 'error' }> = {
  saved: { text: 'Saved.', tone: 'ok' },
  created: { text: 'Created.', tone: 'ok' },
  deleted: { text: 'Deleted.', tone: 'ok' },
  archived: { text: 'Archived.', tone: 'ok' },
  unarchived: { text: 'Moved back to the working list.', tone: 'ok' },
  status: { text: 'Status changed.', tone: 'ok' },
  status_queued: { text: 'Status changed; an e-mail to the sender was queued.', tone: 'ok' },
  status_off: { text: 'Status changed. No e-mail was sent: e-mail is not configured on this server.', tone: 'ok' },
  noted: { text: 'Note added.', tone: 'ok' },
  password: { text: 'Password changed. Other sessions were signed out.', tone: 'ok' },
  maintenance: { text: 'Maintenance ran.', tone: 'ok' },
  published: { text: 'The publish hook answered successfully. The site is being rebuilt.', tone: 'ok' },
  publish_failed: { text: 'The publish hook did not answer successfully. Nothing was published.', tone: 'error' },
  invalid: { text: 'That was not accepted.', tone: 'error' },
  conflict: { text: 'That cannot be done: it is in use, or it already exists.', tone: 'error' },
  forbidden: { text: 'Your role does not allow that.', tone: 'error' },
}

export const ADMIN_CSS = `
:root{color-scheme:light dark;--ink:#0b0b0d;--paper:#f4f0e8;--red:#c4000a;--line:#cfc9bb;--muted:#5c5a55;--ok:#0a6b2f;--bad:#a30008;--card:#fff}
@media (prefers-color-scheme:dark){:root{--ink:#f4f0e8;--paper:#0f0f12;--red:#ff4d54;--line:#34343b;--muted:#a9a49b;--ok:#52d081;--bad:#ff7a80;--card:#17171b}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif}
a{color:inherit}
:focus-visible{outline:3px solid var(--red);outline-offset:2px}
header.bar{display:flex;flex-wrap:wrap;gap:.5rem 1.25rem;align-items:center;padding:.75rem 1rem;background:#0b0b0d;color:#f4f0e8;border-bottom:4px solid #ff161f}
header.bar a{color:#f4f0e8;text-decoration:none;padding:.35rem .5rem}
header.bar a[aria-current=page]{border-bottom:2px solid #ff161f}
header.bar .brand{font-weight:700;letter-spacing:.12em;text-transform:uppercase}
header.bar form{margin-left:auto;display:flex;gap:.5rem;align-items:center}
header.bar button.secondary{color:#f4f0e8;border-color:#f4f0e8}
main{max-width:76rem;margin:0 auto;padding:1.25rem 1rem 4rem}
h1{font-size:1.6rem;margin:.25rem 0 1rem}h2{font-size:1.2rem;margin:2rem 0 .75rem}h3{font-size:1rem;margin:1.25rem 0 .5rem}
.card{background:var(--card);border:1px solid var(--line);padding:1rem;margin:0 0 1rem}
.grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(14rem,1fr))}
.stat{font-size:2rem;font-weight:700;line-height:1}.muted{color:var(--muted)}
table{width:100%;border-collapse:collapse;background:var(--card)}th,td{padding:.5rem .6rem;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:.8rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.scroll{overflow-x:auto}
.badge{display:inline-block;padding:.1rem .5rem;border:1px solid var(--line);font-size:.8rem}
.badge.new{border-color:var(--red);color:var(--red);font-weight:600}
.flash{padding:.75rem 1rem;margin:0 0 1rem;border-left:4px solid}.flash.ok{border-color:var(--ok)}.flash.error{border-color:var(--bad)}
label{display:block;font-weight:600;margin:.75rem 0 .25rem}
input[type=text],input[type=email],input[type=password],input[type=number],input[type=search],select,textarea{width:100%;max-width:44rem;padding:.5rem;border:1px solid var(--muted);background:var(--card);color:var(--ink);font:inherit}
textarea{min-height:6rem}
.row{display:flex;flex-wrap:wrap;gap:.75rem;align-items:end}
.checks label{display:inline-block;font-weight:400;margin:.25rem 1rem .25rem 0}
button,.button{display:inline-block;padding:.5rem 1rem;border:2px solid var(--ink);background:var(--ink);color:var(--paper);font:inherit;font-weight:600;cursor:pointer;text-decoration:none}
button.secondary,.button.secondary{background:transparent;color:var(--ink)}button.danger{background:var(--bad);border-color:var(--bad);color:#fff}
.err{color:var(--bad);font-size:.9rem;margin:.25rem 0 0}
pre.text{white-space:pre-wrap;word-break:break-word;margin:0;font:inherit}
.pager{display:flex;gap:1rem;margin:1rem 0}
fieldset{border:1px solid var(--line);margin:1rem 0;padding:.5rem 1rem 1rem}legend{font-weight:700;padding:0 .5rem}
dl.meta{display:grid;grid-template-columns:max-content 1fr;gap:.25rem 1rem}dl.meta dt{color:var(--muted)}dl.meta dd{margin:0}
.login{max-width:26rem;margin:4rem auto}
`

export interface NavItem {
  href: string
  label: string
  permission?: Parameters<typeof can>[1]
}

const NAV: NavItem[] = [
  { href: '/admin/dashboard', label: 'Dashboard' },
  { href: '/admin/inquiries', label: 'Messages' },
  { href: '/admin/quote-requests', label: 'Quote requests' },
  { href: '/admin/catalog', label: 'Catalogue' },
  { href: '/admin/system', label: 'System', permission: 'system:read' },
]

export function layout(options: { title: string; session: SessionInfo | null; path?: string; flash?: string | null; body: Part }): string {
  const { title, session, path, flash, body } = options
  const note = flash ? FLASH[flash] : undefined
  const nav = session
    ? joinHtml(
        NAV.filter((item) => !item.permission || can(session.role, item.permission)).map((item) => html`<a href="${item.href}"${path === item.href || (path ?? '').startsWith(item.href + '/') ? raw(' aria-current="page"') : ''}>${item.label}</a>`),
      )
    : ''
  const account = session
    ? html`<form method="post" action="/admin/logout"><span class="muted"><a href="/admin/account">${session.email}</a></span><input type="hidden" name="_csrf" value="${session.csrfToken}"><button class="secondary" type="submit">Sign out</button></form>`
    : ''
  return html`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} · Admin</title><link rel="stylesheet" href="/admin/assets/admin.css"></head>
<body>
<header class="bar"><span class="brand">Admin</span>${nav}${account}</header>
<main>${note ? html`<p class="flash ${note.tone}" role="status">${note.text}</p>` : ''}${body}</main>
</body></html>`.value
}

export const csrfInput = (token: string): Raw => html`<input type="hidden" name="_csrf" value="${token}">`

export function statusBadge(status: string, fresh = 'new'): Raw {
  return html`<span class="badge${status === fresh ? ' new' : ''}">${status.replace(/_/g, ' ')}</span>`
}

export function field(options: { name: string; label: string; value?: string | number | null; type?: string; errors?: Record<string, string>; required?: boolean; hint?: string; id?: string }): Raw {
  const id = options.id ?? `f-${options.name.replace(/[^a-z0-9]/gi, '-')}`
  const error = options.errors?.[options.name]
  return html`<div><label for="${id}">${options.label}</label><input id="${id}" name="${options.name}" type="${options.type ?? 'text'}" value="${options.value ?? ''}"${options.required ? raw(' required') : ''}${error ? raw(` aria-invalid="true" aria-describedby="${id}-e"`) : ''}>${options.hint ? html`<div class="muted">${options.hint}</div>` : ''}${error ? html`<p class="err" id="${id}-e">${errorText(error)}</p>` : ''}</div>`
}

export function textarea(options: { name: string; label: string; value?: string | null; errors?: Record<string, string>; rows?: number; hint?: string }): Raw {
  const id = `f-${options.name.replace(/[^a-z0-9]/gi, '-')}`
  const error = options.errors?.[options.name]
  return html`<div><label for="${id}">${options.label}</label><textarea id="${id}" name="${options.name}" rows="${options.rows ?? 4}"${error ? raw(` aria-invalid="true" aria-describedby="${id}-e"`) : ''}>${options.value ?? ''}</textarea>${options.hint ? html`<div class="muted">${options.hint}</div>` : ''}${error ? html`<p class="err" id="${id}-e">${errorText(error)}</p>` : ''}</div>`
}

export function select(options: { name: string; label: string; value?: string | null; choices: readonly (readonly [string, string])[]; errors?: Record<string, string> }): Raw {
  const id = `f-${options.name.replace(/[^a-z0-9]/gi, '-')}`
  const error = options.errors?.[options.name]
  return html`<div><label for="${id}">${options.label}</label><select id="${id}" name="${options.name}">${joinHtml(options.choices.map(([value, label]) => html`<option value="${value}"${value === options.value ? raw(' selected') : ''}>${label}</option>`))}</select>${error ? html`<p class="err">${errorText(error)}</p>` : ''}</div>`
}

export function checkbox(name: string, label: string, checked: boolean, value = 'on'): Raw {
  return html`<label><input type="checkbox" name="${name}" value="${value}"${checked ? raw(' checked') : ''}> ${label}</label>`
}

const ERROR_TEXT: Record<string, string> = {
  required: 'This is required.',
  tooShort: 'This is too short.',
  tooLong: 'This is too long.',
  invalidEmail: 'This is not a valid e-mail address.',
  invalid: 'This value is not allowed.',
  unknown: 'This refers to something that does not exist.',
  duplicate: 'This is already used.',
  tooMany: 'There are too many.',
}
export const errorText = (code: string): string => ERROR_TEXT[code] ?? 'This is not accepted.'

export function pager(path: string, query: URLSearchParams, page: number, total: number, pageSize: number): Raw {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const link = (target: number, label: string) => {
    const next = new URLSearchParams(query)
    next.set('page', String(target))
    return html`<a href="${path}?${next.toString()}">${label}</a>`
  }
  return html`<nav class="pager" aria-label="Pages"><span>Page ${page} of ${pages} (${total})</span>${page > 1 ? link(page - 1, 'Previous') : ''}${page < pages ? link(page + 1, 'Next') : ''}</nav>`
}

export const dateText = (isoText: string | null): string => (isoText ? isoText.replace('T', ' ').slice(0, 16) : '—')

export const lines = (value: string): string[] => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

export const maskAddress = (address: string): string => address.replace(/^(.).*(@.*)$/, '$1***$2')

export { escapeHtml }
