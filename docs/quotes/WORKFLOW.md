# The quotation workflow, end to end

How a request becomes an accepted quotation on this platform, who may do what at each step, and what is written down. This is the implementation as it is (PROMPT 17 built it, PROMPT 21 audited it and closed the gaps listed in [`PLAN_21.md`](PLAN_21.md)); the fine detail of money, versions and links is in [`README.md`](README.md), the security view in [`SECURITY.md`](SECURITY.md), the e-mails in [`EMAILS.md`](EMAILS.md).

There is **one** store (`quote_requests`, `quotes`), **one** outbox (`email_deliveries`) and **one** history (`quote_events`). Nothing in it takes, simulates or implies a payment.

## 1. Ways in

Every way in ends in `createQuoteRequest` (`server/src/modules/quotes/create.ts`): the same public reference (`CC-2026-000001`), the same first line in the history, the same private status link. `request_type` and `source` say what it is and where it came from.

| Way in | Who writes it | `source` / `request_type` | What is stored | Notes |
| --- | --- | --- | --- | --- |
| **Shop request builder** (package, add-ons, custom) | the visitor, in the browser | `shop` / `package_quote`, `custom_service`, `custom_application`, `custom_website`, `standard_inquiry` | services, packages, add-ons (the names as they were), description, objective, timing, budget in the visitor's words, language, contact, company, website, privacy acknowledgement and the **separate** marketing choice | the server re-reads every price from the catalogue; a price, a total, a type or a source in the request is ignored; an add-on the chosen package does not list is refused (422) |
| **FULL EXPERIENCE** configurator | the visitor | `shop` / `full_experience` | the answers **with the questions and labels as they were**, the project size guide **worked out by the server** (a planning aid, never a price), the same contact and consent fields | the size sent by the browser is ignored |
| **CONTROL ROOM AI** | the visitor, **after approving the plan** | `control_room_ai` / `ai_project` | the plan, its brief, the approval (name, e-mail, consent, plan version and hash) | nothing is created before the visitor approves; see `server/test/aiTools.test.ts` |
| **Contact message that is a project quote request** | an administrator, from the message page ("Make a quote request from this message") | `contact_form` / `general_business` (or the type chosen) | name, e-mail, language and message of the sender, **linked to the message**; the message's own privacy acknowledgement carries over, marketing consent does not | one message becomes one request: a second attempt is refused (409 `already_converted`, naming the request) unless the first was cancelled. **Nobody is e-mailed**: the sender wrote a message, not a request, so no confirmation is sent in their name |
| **By hand** (a phone call) | an administrator | `other` / one of six types | typed fields; no privacy acknowledgement is on record, and the page says so | API only (`POST /api/admin/quote-requests`); the screen for it was planned (its words exist in the admin text files) and is not built |

What the submission answers: the reference, the date, `confirmationEmail: queued | not_sent` (so the page can say honestly that a confirmation will not come when e-mail is off), the private status link, and the published price figures. A repeated submission (the same content within the duplicate window) gets the **first** reference and link back and creates **no** second request and **no** second e-mail.

## 2. Statuses

Ten stored statuses, plus *archived* as a flag (an archived request keeps its status). The names are fixed; they are the same in the database, the API, the three e-mail languages and the two administration languages.

| From | An administrator may move it to |
| --- | --- |
| New | Under review, Waiting for the customer, Quotation preparation, Cancelled |
| Under review / Waiting for the customer / Quotation preparation | the other two of those three, Cancelled |
| Quotation sent | Under review, Quotation preparation, Waiting for the customer, Cancelled, and (with a note saying it happened elsewhere) Accepted or Declined |
| Accepted | In progress, Cancelled |
| Declined | Under review, Cancelled |
| In progress | Completed, Cancelled |
| Completed | In progress |
| Cancelled | Under review |

* **Quotation sent** is reached only by sending a quotation; an administrator cannot pick it.
* **Accepted** and **Declined** come from the customer on the quotation page. Recording one by hand needs an internal note of at least three characters. **Accepting does not start the project**: In progress is a separate move.
* An invalid move is refused (409 with the reason); an unknown status is refused (422). Moving to the status a request already has changes nothing and writes nothing.
* What the **customer** sees is separate (`customer_status`): it moves only when the administrator ticks "show this" or e-mails it, or when the customer acted themself. An internal move is not announced.

## 3. Who does what, and what is recorded

Every important step writes **one line** in `quote_events` (append-only: the database refuses to change or delete a line) in the same transaction as the step. A line carries a timestamp, an **actor type** (`admin`, `customer`, `system`, `assistant`), the administrator's id when it was one, the reference, a status or two and a short **fixed** phrase. It never carries text a person typed or a secret. What an administrator did also goes to the audit log.

| Step | Actor on the line | Written by |
| --- | --- | --- |
| request created | `system` (the public form), `assistant`, or `admin` (typed in, or made from a message) | `createQuoteRequest` |
| status changed, priority, note, archive, link to a message, message shown to the customer, customer e-mailed | `admin` | `quotes/admin.ts` |
| quotation created, edited, version made, sent, sent again, withdrawn, replaced | `admin` | `quotes/quotations.ts`, `lifecycle.ts` |
| the customer accepted / declined / asked for a change (and the status move it caused) | `customer` | `quotes/customer.ts` |
| **the customer's links ended by an administrator** | `admin` | `revokeLinks` (new in PROMPT 21) |
| **a message to the customer was refused, bounced or reported as spam** | `system` | `Notifier.reportDeliveryProblem` (new in PROMPT 21) |
| e-mail sent again | `admin` | `quotes/admin.ts` |

Private **notes** are for administrators only: they are never on a customer page, in an e-mail or in an export a customer could receive. Customer actions and administrator actions are never mixed up: the customer's carry `actor_type = customer` and no user id; the administrator's carry their id.

## 4. Duplicates and repeated actions

| What can be done twice | What happens the second time |
| --- | --- |
| the public form submitted again | the first reference and link come back; no second request, no second e-mail |
| **a contact message turned into a request again** | 409 `already_converted` with the reference; nothing is created |
| a quotation sent twice | the second is refused (409 `not_draft`): the update that marks it sent is the check |
| the customer's accept / decline / ask button pressed twice, in two tabs, or at once | one wins (200); the other is told it was already done (409 `already_used` / `already_decided`); one history line, one e-mail to each side |
| a status "changed" to the status it has | nothing |
| the administrator ends the links twice | the second ends nothing, says so, and writes no second history line |
| the same message failing again after being retried | the history says so each time; the owner is alerted **once per message** (the database refuses a second alert row) |
| an administrator sends a quotation e-mail again | a new message, on purpose (a lost link), with a new link |

Exactly-once e-mails are enforced by the database (a partial unique index), not by the code that queues them.

## 5. The quotation

Fields, pricing modes, money, tax and versions are described in [`README.md`](README.md) §5. In short: integer minor units only, a total is always recomputed on the server, a tax figure exists only when an administrator entered a rate **and** confirmed it, a discount needs a reason, and **a sent version can never be changed** (the database refuses it); a change is a new version, which replaces the old one only when it is sent and ends the old one's links.

* **Preview** (PROMPT 21): the editor shows the saved quotation as the customer will read it, in the quotation's own language. The headings are the administrator's words; the text, the amounts and the language are the offer's. It says when there are unsaved changes (the preview then still shows the last saved version). A sent version shows its preview too.
* **A new version has no last day**: the administrator must choose one for the new offer; the checklist says so before it can be sent.

## 6. The customer

Everything a customer does starts from a link in an e-mail (or the status page's link to the offer): a secret in the address, nothing else. They can:

* open the **status page** (`/{lang}/request/<secret>`): the status they were shown, what the administrator chose to tell them, the offers sent to them;
* open the **quotation** (`/{lang}/quote/<secret>`): the whole offer, with its price, validity and terms. Opening it, or reading the e-mail, accepts nothing;
* **accept** (needs a ticked confirmation), **decline** (with an optional reason, needs a ticked confirmation), or **ask for a change or clarification** (a message of at least three characters). Each is checked, spent and acted on in one transaction;
* after asking, they get a **receipt** (PROMPT 21) in the offer's language saying that nothing was accepted or declined and what happens if a new version is made. The offer is unchanged until the administrator sends a new version.

A link that was replaced or ended says so in the customer's language (410); one that never existed says it is not valid (404, the same words for every wrong guess).

## 7. The administrator's screens (`/admin`)

| Screen | What it offers |
| --- | --- |
| **Quote requests** (list) | counters from the database; search (name, e-mail, reference, company, text); filters: status (and the archive), type, priority, source, **language** (PROMPT 21), date from / to; sort by date, name, status, priority, type, reference; CSV of the current list |
| **A request** | every field, the FULL EXPERIENCE brief with its size guide, the items; the versions with their status, what each is worth, and **View / Edit / Send again / Withdraw / New version**; the customer's questions; the **e-mails about it with their real state and a retry** (and a warning when one to the customer did not get through); the history; notes; what the customer sees; **End the customer's links** (PROMPT 21); status, priority, archive, cancel, delete (administrators only), JSON export |
| **The quotation editor** | the draft, a checklist of what is missing, the server's totals, send (with a confirmation), discard, and the **preview** |
| **A contact message** | **Make a quote request from this message** (PROMPT 21), hidden once the message has a request that is not cancelled |

Permissions: reading needs `requests:read`, anything that changes a request needs `requests:write` (administrators and editors), deleting needs `requests:delete` (administrators). They are checked in the business function, not only at the route.

## 8. What happens to the data

Nothing is deleted by the workflow. `RETENTION_DAYS` (the owner's decision; unset keeps everything) removes finished requests (completed, cancelled, declined or archived) and old e-mail records; a request still open is never removed by age. An administrator can delete one request, and `npm run server:cli -- erase <address>` forgets everything about one address: the request, its quotations, links, e-mails (**including the owner's alerts about them**, PROMPT 21) and notes. The history keeps one line per event with a reference and a status and nothing a person wrote.
