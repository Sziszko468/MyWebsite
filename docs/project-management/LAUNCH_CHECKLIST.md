# Launch checklist: project management and timeline

Nothing here has been done for you, and nothing was merged, deployed or migrated in production. This is the list of what must happen, in order, before a real customer uses it. The client portal's own list ([../client-portal/LAUNCH_CHECKLIST.md](../client-portal/LAUNCH_CHECKLIST.md)) comes first: this work needs a working portal.

## A. Before anything is deployed

1. **Review the branch** `feature/project-management-timeline` (based on `feature/client-portal`, which is itself not merged). It touches no protected branch and no deployment configuration.
2. **Back up the production database** before migration `0013`. The migration rebuilds two tables (`client_project_events`, `email_deliveries`) with their rows; it was tested on a database holding 0012's data, **not on a copy of the production file**: do that rehearsal (copy the file, run `npm run server:migrate` against the copy, check `PRAGMA foreign_key_check` and the row counts).
3. The migration is applied by `npm run server:migrate` (or at start-up when `MIGRATE_ON_START` is true); a server with a pending migration and neither refuses to start. There is no down-migration: the way back is the backup ([ARCHITECTURE.md](ARCHITECTURE.md) §6).

## B. Configuration

| Item | Why | Done |
| --- | --- | --- |
| The e-mail provider, `EMAIL_FROM`, `PUBLIC_URL`, `NOTIFY_TO` (and `NOTIFY_LANGUAGE`) | every message of the work needs them; the **owner's** message ("a customer answered") goes to `NOTIFY_TO` | ☐ |
| Sender DNS (SPF, DKIM, DMARC): the platform audit's open finding **E-1** | without it messages may be filtered; this work adds more of them | ☐ |
| The **daily maintenance runs** (the server's own timer, or a scheduled `npm run server:maintenance`) | the reminders are queued only by it. On a host that stops the process when idle, a reminder is queued the next time the process runs | ☐ |
| `RETENTION_DAYS` | does **not** delete projects, tasks or answers (unchanged): decide how long a finished project's work is kept | ☐ |

## C. The owner's decisions (the defaults are the cautious ones)

| Decision | Default | Where |
| --- | --- | --- |
| Which categories exist | none; *Add the suggested categories* adds seven you can rename or remove | `/admin/work/settings` |
| Tell the customer when a request is given | on | same |
| "Due soon" reminder, and how many days before | on, 3 days | same |
| "Overdue" reminder | **off** | same |
| E-mail when a milestone is completed | **off** | same |
| E-mail the customer about an accepted answer / a request for changes | on | same |
| Tell me (the owner) when a customer answers | on | same |
| Who may change categories and these choices | the administrator only; an editor works on tasks and requests | fixed in code |
| Whether to put a sentence about answers to requests in the **privacy notice** | not changed; the notice describes the portal's data in general terms | needs a lawyer |
| How long a customer's answers are kept | until the owner erases the customer; no age-based deletion | the owner |

## D. Reviews that were not done

* **Native-speaker proofreading** of the Hungarian, English and Dutch texts (the portal's work texts, the administration's texts, the seven e-mails). They pass the site's checks (complete in all languages, placeholders, glossary, register, spelling dictionaries); that is not proofreading.
* **Assistive technology**: axe (WCAG 2.2 AA and best practice) found nothing on any screen at 1440, 1024, 768, 390 and 320 px, and the board is operable with a keyboard, but **no screen reader and no switch device was used by a person**.
* **Real mail clients**: the e-mails were not opened in Gmail, Outlook or a phone.
* **A real customer, a real provider, real DNS**: none.

## E. Known limits (so they are not discovered by a customer)

* **No file upload**: an answer is text; the form says so ([CUSTOMER_ACTIONS.md](CUSTOMER_ACTIONS.md)).
* No comments from the customer on a task, no messages beyond the answer / review loop, no notifications inside the portal (only e-mail and the page itself), no real-time update (a page shows what it loaded).
* A task is **shared or private**: there is no "visible to some customers" (a project has one customer).
* The board's drag and drop is an extra; the menu and the buttons are the way that always works. Dates are edited in the form, not on the schedule.
* Reminders are by calendar day in the owner's booking zone (or UTC): a customer in another zone gets the message on the owner's day.
* The board loads every task of a project (up to 500; the list endpoint caps at 1000): a project with thousands of tasks is not the design target.
* One writer: SQLite is single-writer by design (as everywhere on the site).
* A timeline line about a hidden **milestone** that is later **deleted** can reappear to the customer (the line is append-only and the milestone no longer exists to say it was hidden); a milestone the owner wants to keep out of sight should be hidden **before** it is completed or announced, and hiding it removes its lines while it exists.

## F. Suggested first use

1. Deploy to a **staging** copy, migrate a copy of the real data, invite yourself as a customer with an address you control.
2. Make a project, a few tasks (one private), a dependency, a request; answer it as the customer; ask for changes; accept.
3. Read each e-mail in a real mail client, in each language you will use.
4. Only then switch on the reminders you want, and use it with one real customer.
