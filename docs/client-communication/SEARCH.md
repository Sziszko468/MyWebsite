# Search

Search is **done by the backend**, never by filtering what the browser already holds. It is a parameterized `LIKE` over the fields below, always inside a scope the server fixed in SQL.

## What is searched, for whom

| | Customer (`GET /api/portal/messages/search?q=`) | Owner (`GET /api/admin/communications/search?q=` and `…/:reference/search?q=`) |
| --- | --- | --- |
| Scope | **their own** threads (through the session's customer id) | every conversation they may read |
| Subject | yes | yes |
| Conversation reference | yes | yes |
| Project name and reference | yes | yes |
| Customer's name, e-mail, company | — | yes |
| Words of customer-visible messages | yes (not removed, not events) | yes (not removed, not events) |
| **Private notes** | **never** | yes; a hit that is only in a note says **"Found in a private note"** |
| Removed messages | never | never |
| System events | never (they have no words) | never |

The result of a customer's search is the **same list item as the inbox** (so the same unread, status and preview) plus a *snippet*: a few words around the first place the term occurs in a visible message. The snippet never comes from a note.

## Rules

* **2 to 100 characters** after trimming and collapsing white space (`tooShort` / `tooLong`, `422`); no control characters. A one-letter search would be a scan of everything and noise; more than 100 characters is not a person typing.
* **Wildcards are text.** `%` and `_` and `\` in the term are escaped and the query says `ESCAPE '\'`: searching `50%` finds "50%", not every message. Nothing a person typed is ever put into SQL text; the static-SQL test (`security.test.ts`) refuses a statement whose template interpolates anything but fixed fragments.
* **Paged**: the inbox returns 30 conversations per page by default, **50 at most** (`limit`), by a **keyset cursor** `(last_activity_at, id)` — stable while rows are added, no `OFFSET`. A search returns the same sized list (the most recently active matches first) and is **not paged** (a more specific term narrows it). A malformed cursor, limit or filter is refused (`422`), not ignored. Inside a conversation, older messages are fetched by `before=<seq>` the same way as the cursor.
* **Rate limited by address**: 20 searches a minute (`messageSearch`), 40 sends in ten minutes (`messageSend`); reading the inbox is not stopped by either (it has the portal's own, wider limit). Over the limit: `429` with `Retry-After`.
* **Authorization first**: a signed-out caller gets `401`, an administrator's cookie is nothing on the customer's endpoints and the customer's is nothing on the administration's; the administration's reading endpoints need `clients:read`.
* **Private**: every answer is `Cache-Control: no-store`. The term travels in the query string of an authenticated, same-origin `GET`; the screens keep it in the page's state and **not in the page address**, and the application's request log records only the route pattern, never the query string. **A proxy in front of the application (Render, Cloudflare) may log full request addresses** — that is the host's setting and is listed in LAUNCH_CHECKLIST.md.

## The owner's inbox filters

*Show*: all, unread, open (not finished), waiting for you, waiting for the customer, resolved, archived; *Customer*; *Project*; *About* (project, deliverable, task, booking, quote); *From* and *To* (by the last activity). Combined filters are ANDed; *"Clear the filters"* resets them; an empty result says so. Every value is checked against a fixed list or a plain id before it reaches a query.

## What search is not

No relevance ranking, no stemming, no accent folding beyond what SQLite's `LIKE` does for ASCII (a search is a case-insensitive *contains* for ASCII letters; for other letters it is exact). That is enough for the volume this site will have; full-text search was not added because it would be a second index to keep consistent with the privacy rules above.
