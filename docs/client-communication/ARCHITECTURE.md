# Architecture

Everything reuses what the project already has: React 19 + TypeScript + Vite, the Node backend with `node:sqlite`, additive numbered migrations, the customer sessions and ownership checks of the client portal, the administration's permissions, the e-mail outbox, the three languages and the Racing Red design system. **No new runtime dependency, no second backend, no second database, no new authentication, no new e-mail provider.**

## The modules

```
server/src/modules/communications/
  model.ts       the lists (statuses, kinds, events), LIMITS, row types, the owner's settings
  service.ts     the rules: start a thread, post a message, the status machine, resolution request, remove / edit
  reads.ts       read markers and unread counts (computed, never stored)
  events.ts      system events: the writer (idempotent, never throws) and the four mirrors
  search.ts      the search term, the LIKE pattern, snippets, cursors and page sizes
  notify.ts      the six e-mails: the owner's switch AND the customer's choice, once-only
  preferences.ts the customer's e-mail choices
  settings.ts    the owner's choices (stored under `communications.settings`)
  input.ts       reading a body field by field (shared)
  customer.ts    what a customer can do (ownership on every call)
  views.ts       the two read models (customer and administration), the timeline query
  admin.ts       the owner's endpoints (permissions, audit, bodies)
  routes.ts      the addresses
server/src/modules/notifications/communicationTemplates.ts   the six e-mails, HU / EN / NL
server/src/db/migrations/0015_client_communications.sql
four one-line hooks: customers/projects.ts (recordProjectEvent), deliverables/service.ts (recordEvent),
                     bookings/repository.ts (recordBookingEvent), quotes/events.ts (recordEvent)
src/components/portal/MessagesViews.tsx (+ Messages.module.scss), src/portal/unread.tsx, unreadContext.ts
src/admin/pages/CommunicationsPage.tsx, CommunicationPage.tsx, src/admin/api/communications.ts, src/admin/i18n/communications.ts
```

## The life of a request

**The customer** (`/api/portal/messages…`) → the portal's rate limit (`portal`, and `messageSend` / `messageSearch` for sending and searching) → the customer's session cookie and, for a change, the CSRF token → `ownConversation` looks the conversation up **through the customer** (`reference = ? AND customer_id = ?`; a thread nobody has written a visible word in is not theirs yet) → the rule in `service.ts` inside one transaction → the answer is the whole refreshed conversation (so the screen never guesses what the server decided).

**The owner** (`/api/admin/communications…`) → the administrator's session and CSRF → `requirePermission` → `service.ts` → the refreshed conversation.

Every body is read **field by field** (`input.ts`, `exact()`): an unknown key is refused, so a sender, a customer, a status or a visibility in a body is never believed. The sender of a message is the session.

## The endpoints

| | Method and address | Does |
| --- | --- | --- |
| Customer | `GET /api/portal/messages/summary` | the unread total, whether they may start a conversation (`canStart`), and `attachments: false` (the screens read it, so a future switch needs no new screen logic) |
| | `GET /api/portal/messages[?filter=all\|unread\|open\|resolved][&cursor][&limit]` | the inbox (threads and activity feeds), newest first, paged |
| | `GET /api/portal/messages/search?q=` | their own conversations, by subject, words, project, reference |
| | `GET /api/portal/messages/contexts` | the records a conversation can be about (theirs, visible to them) |
| | `POST /api/portal/messages` | start a conversation (when the owner allows it) |
| | `GET /api/portal/messages/:reference[?before=seq][&limit]` | one conversation: a page of the timeline |
| | `POST /api/portal/messages/:reference/messages` | write in it |
| | `POST /api/portal/messages/:reference/read` | `{ upTo }`: the screen has shown messages up to there |
| | `POST /api/portal/messages/:reference/request-resolution` | ask for it to be resolved |
| | `GET` / `PUT /api/portal/message-preferences` | their e-mail choices |
| Owner (`clients:read`) | `GET /api/admin/communications/overview` | real counts and the recent conversations |
| | `GET /api/admin/communications[?filter&customerId&projectId&context&from&to&cursor&limit]` | the inbox |
| | `GET /api/admin/communications/search?q=` | everything the inbox searches, and the private notes |
| | `GET /api/admin/communications/contexts?customerId=` | what a conversation with this customer can be about |
| | `GET /api/admin/communications/:reference[?before&limit]` | one conversation with the private notes |
| | `GET /api/admin/communications/:reference/search?q=` | search inside it |
| | `POST /api/admin/communications/:reference/read` | their own read marker |
| | `GET /api/admin/communication-settings` | the owner's choices |
| Owner (`clients:projects`) | `POST /api/admin/communications` | start a conversation with a customer |
| | `POST …/:reference/messages` | a reply, an announcement (`confirm: true`) or a private note |
| | `PATCH …/:reference/messages/:id` | edit **your own private note** |
| | `DELETE …/:reference/messages/:id` | remove **your own** message or note |
| | `POST …/:reference/status` | `{ status, revision }` |
| Administrator (`system:write`) | `PUT /api/admin/communication-settings` | the owner's switches |

Every answer carries `Cache-Control: no-store` and no CORS header; the pages are noindex, no-referrer and unmeasured like every portal page.

## How it plugs in

* **Client portal.** A new item in the menu with the unread badge; `/<lang>/client-portal/messages…` needs no registration (the portal is one page for every address below it, and its headers already cover them). The project and deliverable pages link to *"I have a question about this"*.
* **Project work, deliverables, bookings, quotes.** They write their own history lines exactly as before; a one-line call after each (the four hooks) mirrors the customer-visible ones into the activity feed (SYSTEM_EVENTS.md). Nothing in those modules changes behaviour.
* **E-mail outbox.** One new related type (`conversation_message`) and six kinds; the outbox table was rebuilt once more (ids kept).
* **Erasure.** Erasing a customer deletes their conversations, messages, read markers, e-mail choices and the e-mails about them (`customers/retention.ts`).
* **Administration.** A *Communication* item in the menu; links from a customer and a project into the center.

## Rolling it back

Nothing is created for anybody until the owner starts a conversation or a first event is mirrored, so **the feature can be left unused** (and the owner's switches can stop the e-mails). That is the safe way back.

**Going back by deploying older code is not possible once `0015` has been applied to a database.** The migration runner (`server/src/db/migrate.ts`) *refuses to start* on a database that holds a migration its code does not know (*"The database has migration 15, which this version of the server does not know. Refusing to start on a newer schema."*). So after `0015` ran, the ways back are, in this order of preference: (1) leave the feature unused; (2) a **forward fix**: a new migration `0016` and new code; (3) **restore the backup taken before the migration** together with the older code (everything written since the backup is lost). Do not drop the tables by hand from a live database: they hold the record of what was said. The four hooks are one line each and can be removed independently in a forward fix (the feed then simply stops growing).
