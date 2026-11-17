# Client communication (PROMPT 28)

The client portal ([../client-portal/](../client-portal/README.md)) now has **one place to talk to the owner about your projects**: conversations, with the customer's words, the owner's, the owner's **private notes** (which the customer can never see), **announcements**, and the **events** the platform already records about the customer's project, bookings and quotes. Each side has its own **unread** count, e-mail choices, search and a complete history.

> **Status: implemented and tested locally on the branch `feature/client-communication` (based on `feature/client-feedback-approval` at `8c377ad`); not merged, not deployed, not production-ready.** What was and was not verified is in [TEST_RESULTS.md](TEST_RESULTS.md); what the owner still has to do is in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md). How it was planned before it was built is in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

## The principle

**The text of a private conversation stays behind the sign-in.** A message is a record of the platform; an e-mail only says that there is something new and where to read it. A customer sees their own conversations and the owner's customer-visible words, nothing else; the owner sees everything, with their private notes in a visibly different look. Who is writing is always the session, never a request; every number (unread, counts, status) is computed from records and never invented.

## What it is not

* **No attachments.** The site has no private place to keep a customer's file (the media library is the public site's pictures; customer documents are a disabled feature). A message carries words only, and the screens say so. See [SECURITY.md](SECURITY.md) for the reasons and what would have to exist first.
* **Not a ticket system and not a chat.** There are no queues, assignees, priorities, SLAs, typing indicators or read receipts shown to the other side; the customer is never told that the owner has read something.
* **No broadcast.** An announcement goes into one customer's conversation (and asks the owner to confirm); there is no mass mailing.
* **No automatic creation of anything.** Nothing is made from a quote or a consultation, and no event is made for something that happened before the feature existed.

## Where it is

| What | Address |
| --- | --- |
| The customer's inbox | `/<lang>/client-portal/messages` (unread badge in the portal's menu) |
| One conversation (the customer) | `/<lang>/client-portal/messages/MSG-…` (or `ACT-…`: a project's activity feed) |
| Start a conversation from a project or a deliverable | the *"I have a question about …"* links on those pages (`?about=project:PRJ-…`) |
| The communication center (the owner) | `/admin/communications` (real counts, inbox, filters, search, *New conversation*) |
| One conversation (the owner) | `/admin/communications/MSG-…` (timeline with private notes, composer, status, search inside) |
| The owner's choices | `/admin/work/settings` → *Messages and conversations* (administrator) |
| The customer's API | `/api/portal/messages…`, `/api/portal/message-preferences` |
| The owner's API | `/api/admin/communications…`, `/api/admin/communication-settings` |
| The code | `server/src/modules/communications/` (model, service, reads, events, search, notify, preferences, settings, customer, views, admin, input, routes), `server/src/modules/notifications/communicationTemplates.ts`, `server/src/db/migrations/0015_client_communications.sql`, `src/components/portal/MessagesViews.tsx`, `src/admin/pages/Communication(s)Page.tsx` |

## The owner's first steps

1. Administration → **Communication** → **New conversation**: choose a customer, write a subject and the first message. The customer is e-mailed once (without the text) and finds it under *Messages*.
2. To let customers start conversations themselves, switch on *Customers may start conversations* in *Work settings → Messages and conversations*. **It is off until you do**; customers can always answer yours.
3. Use **A private note** in the composer for what only you should know. It is drawn differently (dashed border, *Private note* label) and appears in no page, search result or e-mail of the customer.
4. An **announcement** asks you to confirm before it goes.
5. Set the **status** by hand when you want (resolving tells the customer); it otherwise follows who is expected to answer.

## The documents

| File | What is in it |
| --- | --- |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | The audit and the plan that were written before the code |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Modules, the life of a request, every endpoint and permission, how it plugs into the rest, rollback |
| [DATA_MODEL.md](DATA_MODEL.md) | Migration 0015: tables, constraints, triggers, indexes, the outbox rebuild, backup |
| [CONVERSATION_WORKFLOW.md](CONVERSATION_WORKFLOW.md) | Statuses and the rules between them, starting, announcements, notes, removal, resolution |
| [MESSAGE_VISIBILITY.md](MESSAGE_VISIBILITY.md) | What each side can see, and what keeps a private note private |
| [SYSTEM_EVENTS.md](SYSTEM_EVENTS.md) | Which facts become events, how they are mirrored once, and why none is invented |
| [NOTIFICATIONS.md](NOTIFICATIONS.md) | The six e-mails, who gets them, once-only, the owner's and the customer's choices |
| [READ_TRACKING.md](READ_TRACKING.md) | Read markers, what counts as unread, and the rules at the edges |
| [SEARCH.md](SEARCH.md) | What is searched, for whom, with which limits |
| [SECURITY.md](SECURITY.md) | The measures, the attachments decision, what is not protected against |
| [LOCALIZATION.md](LOCALIZATION.md) | Hungarian, English, Dutch: where the words are and how they are checked |
| [TEST_RESULTS.md](TEST_RESULTS.md) | What was run and what it said, and what was **not** verified |
| [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) | What the owner must do before using it with a real customer |
