# Live verification — quotation and order management

## Status: **NOT PERFORMED** (still so on 2026-11-14, after PROMPT 21)

PROMPT 21 re-read the public DNS (read only): the domain still has no DKIM for the provider, no return-path domain and a DMARC policy without reports. The step-by-step test for the owner to run (including the bounce and the complaint, and the delivery-failure alert PROMPT 21 added) is in [`EMAILS.md`](EMAILS.md) §7; record its date and result here when it has been done.

The brief (§21) asks for a real test on the production system, with designated test customers and test addresses, **after an authorised deployment**. None of that was possible from here and none of it was done:

| Needed | Why it blocks |
|---|---|
| A production host and domain, and authorisation to deploy | nothing was deployed (the brief: "do not deploy automatically") |
| The transactional provider's real API key and a verified sending domain | no real message was sent by any provider; the tests used a recording mailer, a file mailer and a scripted provider |
| DNS records (SPF, DKIM, DMARC, the Email Routing MX), changed by the owner | no DNS was read or changed |
| The provider's webhook configured against the real address, and its signing secret | the signature check is tested with generated signatures, not with the provider's |
| Test mailboxes the owner controls | nobody has received a real quotation e-mail |

So **nothing below has a result**. What *was* verified, and how, is in [`final-report.md`](final-report.md) §Verified; it uses a real browser, the real backend, the real database and the `file` e-mail provider, and must not be mistaken for this.

## The procedure (to run once the blockers are cleared)

Use a test customer address and the owner's address, and write the observed result next to each line. "Delivered" may be written **only** if the administration shows *Delivered* (a verified provider event), never because the provider answered 200.

1. **Real request submission** — on the production site, send a request through the shop on a phone. *Expect:* the receipt with a `CC-…` reference, the date, the summary, the status link.
2. **Database persistence** — Administration → Quote requests shows it with the right type (*Package-based*), source (*Shop*), contact data and budget.
3. **Unique reference** — send a second one; the number is the next one. Send the same one again within ten minutes; the same reference comes back and nothing is sent twice.
4. **Administrator notification** — the owner's inbox has *New quote request (CC-…)* with a working link to the request.
5. **Customer confirmation** — the test mailbox has *We will review your enquiry soon — CC-…* (or the Hungarian / Dutch subject), with the status link. Open the status link: only what was shared is shown.
6. **Quotation creation** — create a quotation, save it, read the totals.
7. **Quotation e-mail** — send it; the test mailbox has the quotation mail with the total, validity and the secure link. In the administration the message becomes *Sent*, then *Delivered* after the webhook. Look at it in a desktop client and on a phone client.
8. **Secure quote access** — open the link on a phone: the whole offer; no sideways scroll; the choices stay on the screen.
9. **Customer acceptance** — accept (tick the confirmation). The page says so.
10. **Acceptance notification** — both the test mailbox and the owner got one message each; nothing says money was paid.
11. **Status updates** — in the administration move the request to *In progress* with "show" and a message; the status page shows it. Move it without "show"; the status page does not change.
12. **A failure on purpose** — with a wrong address (`nobody@invalid.example`) submit a request: it is saved, the confirmation fails or bounces, the administration shows the real state, *Send again* works after the address is fixed in the provider's suppression list, and no duplicate row appears.
13. **Revision** — ask for a change on a second quotation; make a new version with a reason; send it; the old link says it was replaced; the new one works.
14. **Forged webhook** — POST to `/api/webhooks/email` with a wrong signature; it answers 401 and changes nothing.

## Report (fill in)

| # | Result | Evidence (message id, time, screenshot) |
|---|---|---|
| 1–14 | *not performed* | — |

Final status of the system until this is filled in: **Ready after minor configuration** (see the final report).
