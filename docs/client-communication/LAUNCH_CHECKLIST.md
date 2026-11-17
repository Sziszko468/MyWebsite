# Launch checklist

Nothing here has been done for production. The branch is **not merged, not deployed, and has never run against production data, a real e-mail provider, real DNS or a real customer.** This is the list of what stands between the code and a first real conversation, in the order it makes sense to do it. The test numbers are in [TEST_RESULTS.md](TEST_RESULTS.md).

## 1. What is where

| Class | What |
| --- | --- |
| **Implemented** | Conversations and messages (threads, activity feeds, statuses, announcements, private notes, removal and note editing); system events mirrored from project, deliverable, booking and quote records; per-reader read markers; backend search and filters; six e-mails in Hungarian, English and Dutch through the existing outbox; the customer's inbox, conversation, composer, e-mail choices and menu badge; the owner's Communication center, workspace, settings and links from customers and projects; migration 0015; rate limits; the documents. |
| **Tested locally** | Everything above, by the automated suites and the browser journey described in TEST_RESULTS.md, against throw-away databases, the test mailer and the `file` e-mail provider. |
| **Not tested** | Real e-mail delivery and rendering in mail programs; Safari, Firefox and real phones; a screen reader; timing/enumeration attacks; load with many conversations; a migration of a **real** database (only the upgrade of an empty and a populated *test* database from the previous schema); anything on the deployment branch. See §6. |
| **Requires owner configuration** | §3 and §4. |
| **Requires production verification** | §5. |

## 2. Before it is merged

1. **Review the branch.** It is `feature/client-communication`, based on `feature/client-feedback-approval` (`8c377ad`), which is based on the earlier feature branches in order: consultation booking → client portal → project management → feedback. **They have to be merged in that order**, and none of them is merged anywhere yet.
2. **Migration numbers, and why this branch must not be deployed alone.** This chain uses `0009`…`0015`. The deployment branch (`deployment/render-cloudflare`) has `0001`…`0008` and `0030_gmail_messages.sql`; according to the earlier audit's notes the operations line has its own `0040` (not checked again here). No two of the files I could read share a number. The runner applies every migration that is not yet recorded, in file order, so the lines can sit next to each other **once they are integrated** — but it **refuses to start** if two files have the same number or if the database holds a number the code does not know. **If the production database has already applied `0030` (the earlier audit's evidence says the live site behaves as if it had), deploying this branch on its own would stop the service**, because this code does not know `0030`. The integration of the lines is the earlier audit's open item (`docs/operations/INTEGRATION_PLAN.md` on `feature/consultation-booking`) and is not done here. I read `0030` (read only, from git): it creates its own two tables and does not touch `email_deliveries`, which `0015` rebuilds, so the two do not collide **as written today**. Check this again at integration, and **never rename a migration file after any database has applied it** (its checksum is recorded).
3. **Do not edit `0015` after any real database has applied it.** A change is a new migration.
4. Run the whole test suite and `npm run build` on the merged result (see TEST_RESULTS.md for the commands).

## 3. Owner decisions and configuration

| # | Decision | Where | Default |
| --- | --- | --- | --- |
| 1 | **Let customers start conversations?** | *Work settings → Messages and conversations → Customers may start conversations* | **off**; customers can always answer yours |
| 2 | **Open registration together with customers starting conversations** lets anyone who can read an e-mail address write to you. Keep one off unless that is intended. | the portal's registration setting, and the switch above | registration off |
| 3 | Which e-mails exist at all (replies, announcements, important messages, resolutions, a customer wrote, a resolution was asked) | same page | all on |
| 4 | **`NOTIFY_TO`** (where the owner's e-mails go) and **`NOTIFY_LANGUAGE`** | the server's environment | none: with no `NOTIFY_TO` the owner is **not** e-mailed about a customer's message |
| 5 | **`PUBLIC_URL`** | the server's environment | none: without it the owner's e-mails have **no link** into the administration, and the customer's have none into the portal |
| 6 | The e-mail provider, the sender domain, SPF/DKIM/DMARC | the earlier prompts' open items | not done here |
| 7 | **Retention.** The code keeps a conversation as long as the customer's account (and a project's conversations as long as the project). **No other period is invented.** Decide how long a resolved or archived conversation may be kept and whether the words of a *removed* message (which stay in the database as a tombstone) must be erased. | your policy, then a deliberate operation on a backed-up database | none |
| 8 | **The privacy notice.** The site's privacy page and the portal's notice were written before conversations existed and **do not mention them**. They need: that messages are stored, who can read them (the owner, and administrators with access to customers), that private notes exist and are never shown to the customer, how long they are kept (decision 7), and the e-mail provider as a processor. I did not write legal text or a legal basis. | `content/privacy.ts` and the portal's notice | not updated |
| 9 | **Attachments.** Not built because no private file storage exists (SECURITY.md lists what would have to exist first). Decide how a customer who must send a file will do it. | — | words only |
| 10 | **Native-speaker review** of the Hungarian and Dutch words (portal, administration in Hungarian, the six e-mails). They were written and checked by tools (LOCALIZATION.md), **not** reviewed by a native speaker. | — | not done |
| 11 | Who gets `clients:read` (can read every conversation **and** every private note) and `clients:projects` (can write). | the administrators' roles | existing roles |

## 4. First use

1. **Back up the database first**, and keep the backup until you are sure. The migration is forward-only, and **older code refuses to start on a database that has applied `0015`**: going back means restoring that backup together with the older code, or a forward fix (ARCHITECTURE.md, *Rolling it back*). "Redeploy the previous commit" does **not** work.
2. Start the server with migrations (`npm run server:migrate`, or `MIGRATE_ON_START=true` as you already do). Nothing is created for anybody.
3. Send yourself each of the six e-mails in each language (start a conversation with a customer account that is yours; ask for a resolution; resolve; announce; mark important) and **read them in the mail programs you use**. This was not done.
4. Start one conversation with a real customer by hand. Only then consider switching on customer-started conversations.

## 5. To verify on production once it is there

* The security headers of the new addresses on the live site: `/<lang>/client-portal/messages` (the portal page: noindex, no-referrer, the CSP), and `Cache-Control: no-store` and no CORS header on `/api/portal/messages…` and `/api/admin/communications…`.
* **Rate limits really count the visitor, not the proxy** (`TRUST_PROXY`): the earlier audit found this open on Render behind Cloudflare. If every visitor shares one address, the send and search limits would be shared by everyone.
* **The host's request logs**: Render and Cloudflare may log full request addresses, including a search term in a query string (SEARCH.md). Check the setting.
* A whole conversation end to end with a real customer account: write, read, e-mail, answer, resolve, reopen, with the unread badge following.
* Nothing in the sitemap or the search engines for any `/client-portal/messages…` address.
* **A restore drill**: restore a backup and check that conversations come back with their private notes and their read markers.

## 6. Known limitations and things found but not changed

* **No attachments**, by decision (above).
* **A message is words only**: no formatting, no links made from the words, no reactions, no editing of a message a customer can see (a correction is a new message), and a **customer's message can never be removed** by anybody.
* **Removed messages keep their words in the database** (a tombstone for both screens). There is no screen to erase them.
* **The administration speaks English and Hungarian, not Dutch** (the same as every other administration screen); the customer's pages and the e-mails speak all three.
* **Search is a case-insensitive *contains* for ASCII letters** and exact for others; there is no ranking or full-text index.
* **Only Chromium was driven** (Playwright with the system Chrome). Safari, Firefox and real phones were not.
* **Accessibility** was checked by axe (WCAG 2.2 AA and best practice) on every screen at eight viewport/theme combinations, and by keyboard in the journey for the filters, the search and the preferences; a person with a screen reader has not used it.
* **A pre-existing defect was found and fixed on the way**: the portal's current-page menu link lost its background under the mouse pointer in a narrow window (dark text on a dark surface). The fix is in `Portal.module.scss`; every other portal page benefits.
* **Not touched, for the record**: `main`, `deployment/render-cloudflare`, the earlier feature branches, any production setting or data, Render, Cloudflare, DNS and any e-mail provider.
