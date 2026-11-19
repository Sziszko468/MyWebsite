# Permissions and security

## Roles

The administration has two roles (`admin`, `editor`). The analytics add **no permission of their own**; each section needs the permission of the data behind it, checked on every request against the role stored now (not the one at sign-in).

| Section | Needs | `admin` | `editor` |
| --- | --- | :-: | :-: |
| Overview | any of `requests:read`, `clients:read`, `system:read` — each figure inside is built only if its own permission is held | ✓ | ✓ (all of it: both roles hold requests and clients) |
| Financial pipeline | `requests:read` | ✓ | ✓ |
| Quote funnel | `requests:read` | ✓ | ✓ |
| Consultations | `requests:read` | ✓ | ✓ |
| Customers | `clients:read` | ✓ | ✓ |
| Projects | `clients:read` | ✓ | ✓ |
| Communication | `clients:read` | ✓ | ✓ |
| Alerts | `requests:read` and/or `clients:read` (the rest is named as not available) | ✓ | ✓ |
| AI usage and cost | `system:read` | ✓ | — |
| CSV of a section | the section's permission | ✓ | as above |
| Assistant's analytics tools | `assistant:use` **and** the section's permission, re-read at every call | ✓ | financial/funnel/overview as above |

A section the role may not read is returned as `state: "not_permitted"` with **no figure**; a figure inside the overview the role may not read is `not_permitted` (no value, no reason about the data); the screen says "Not available for your role" and never shows a zero. The tab is not offered; typing its address falls back to the overview.

## Endpoints

| Endpoint | Method | Auth | Notes |
| --- | --- | --- | --- |
| `/api/admin/analytics` | GET | admin session cookie | 401 without a session; 403 for a role that can read none of the three areas; unknown section 404; invalid or unknown parameter 422 |
| `/api/admin/analytics/export` | GET | admin session cookie | section's permission or 403; audited |

Both are read-only. There is no state change, so there is no CSRF-protected write; the session cookie is `HttpOnly; SameSite=Strict` like the rest of the administration, and a cross-site page cannot read the response. Responses are `private, no-store` and `noindex`.

## Input handling

* Parameters are whitelisted (`section`, `period`, `from`, `to`, `currency`, `language`, `service`, `package`, `projectStatus`, `quoteStatus`, `consultationStatus`, `lang`, `report`); an unknown one is a 422 naming it. Values are matched against fixed lists (statuses, currencies, languages, presets) or a slug pattern (`service`, `package`); dates must be real calendar days within limits.
* Every statement is parameterised. The few SQL fragments that are interpolated are constants of the module, held in a local `sql` object that the server's static SQL test recognises; no request value ever reaches SQL text.
* The address of the screen is parsed the same way: a hand-edited address cannot ask for anything the server would not accept (unknown values are dropped).

## What an answer cannot leak

No customer name, e-mail address or phone number; no message text; no private or internal note; no raw prompt or answer of an assistant; no key or secret; no decline-reason text. Alerts carry **public references** (quote, project, task, conversation), dates and codes — the same references the administrator already sees in lists. See [PRIVACY.md](PRIVACY.md).

## The assistant's tools

`getAnalyticsOverview`, `getFinancialAnalytics`, `getFunnelAnalytics` (34 tools in all). Each call, like every call of the PROMPT 31 tools: counts against the answer's tool limit; re-reads the administrator's session and role from the database; resolves the conversation (it must be this administrator's) and its context; checks the permission of the data (`requests:read` for financial and funnel; the overview builds only what the role may read); runs the **same service** as the dashboard; checks the result (plain data, size, no secret-named key, no credential-looking text, the tool's output schema). They are **general-context only** (in a conversation about one record they answer `out_of_context`), take strict inputs (a preset or `fromDay`/`toDay` and a currency; nothing else is accepted), and return the compact form of the section (no series, no tables). The assistant cannot reach a different administrator's data, widen its own permissions, change anything or call any other model. See [AI_USAGE_ANALYTICS.md](AI_USAGE_ANALYTICS.md) for what the assistant is told about figures.
