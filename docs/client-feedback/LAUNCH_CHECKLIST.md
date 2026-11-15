# Launch checklist: what the owner must do before a real customer uses it

The feature is **built and tested locally; it is not deployed, not merged, and nothing was done to production** (no production data touched, no Render or Cloudflare setting changed, no real e-mail sent). Everything below is the owner's, in order. Tick nothing you have not seen work.

## 0. Decide first

- [ ] **Where do previews live?** A host you control (a subdomain such as `previews.your-domain`, a staging site, a static host). A preview is a page the owner hosts: if it should be exactly what was approved, give **each version its own address** (a path or subdomain per version) or use a **picture**. The fingerprint covers the words and addresses, **not the content behind an address**.
- [ ] **Do you want previews shown inside the portal?** If not, do nothing in section 2: every preview is a link that opens in a new tab, and that is fully supported. Pictures with markers need the origin on the list (section 2).
- [ ] **Retention.** How long are deliverables, feedback and approvals kept? None is invented here: today they are kept as long as the customer's account and are removed with it. Write the period in the privacy notice if you choose one.
- [ ] **What an approval means to you.** It is a record that a signed-in customer confirmed one numbered version at one time. It is not an electronic signature. If a contract must be signed, that is a separate step.

## 1. Deploy the code (not done)

- [ ] Review and merge `feature/client-feedback-approval` (based on `feature/project-management-timeline` at `f8db684`, which is in turn based on the client portal). **Nothing was merged or pushed by this work.**
- [ ] **Back up the production database**, then deploy: migration `0014_client_feedback.sql` runs at start-up (`MIGRATE_ON_START`) or with the migration command. It is additive and rebuilds only the e-mail outbox (ids kept). Check the outbox's count of rows before and after.
- [ ] The migration is forward-only. Keep the backup until you have seen a deliverable made, published, reviewed and approved in production.

## 2. Allow previews inside the portal (optional)

- [ ] Set **`PREVIEW_ORIGINS`** on the backend (Render): exact https origins, comma-separated, e.g. `https://previews.your-domain`. No `*`, no path, not your own site's or API's origin (the backend refuses to start otherwise).
- [ ] Set **`VITE_PREVIEW_ORIGINS`** to **the same list** in the build and **rebuild the website**. It is read at build time and goes into the portal pages' Content-Security-Policy (`frame-src`, `img-src`) in `dist/_headers`.
- [ ] Look at the portal's headers in production: `curl -sI https://your-domain/en/client-portal/` must show **one** `Content-Security-Policy` whose `frame-src` is exactly your origin. If your host **joins** headers (Cloudflare Pages does), you will see two policies and the stricter `frame-src 'none'` wins: embedding stays off. Then serve the portal's policy from that host's own configuration (a rule for `/*/client-portal/*`), or leave previews as links.
- [ ] Your preview host must allow being framed **by your portal's origin** (no `X-Frame-Options: DENY`, and a `frame-ancestors` that includes the portal), or the frame is empty (the link still works).
- [ ] Open a preview as a customer and check the browser's console for a refused frame or picture.

## 3. The owner's settings

- [ ] Administration → Work settings → **E-mails about deliverables**: decide each of the seven switches (all on by default).
- [ ] Check `NOTIFY_TO`, `NOTIFY_LANGUAGE`, the sender and the provider of the e-mail module are the real ones, and that the **mail DNS** (SPF, DKIM, DMARC) is in place: the open mail items of the earlier audits still apply. **Nothing in this work sent a real e-mail**, so the real deliverability of these seven messages is **unverified**.
- [ ] Make a deliverable for **yourself** (a test customer with your own address), publish it, send feedback, reply, ask for approval, approve it, and read the seven e-mails in your inbox in each language you serve.

## 4. Words and privacy

- [ ] Have the Hungarian read by you, and the Dutch and English by a native speaker (see LOCALIZATION.md).
- [ ] Update the privacy notice: the portal now also keeps **a customer's feedback and approvals** (their words, positions on a picture, the version and fingerprint they confirmed, and the times), and the owner's **private notes** about them. State your retention and legal basis; this work **did not invent either**.
- [ ] Tell customers what an approval is and is not (the portal's page already says nothing is approved by looking at it).

## 5. First real use

- [ ] Start with **one** project and **one** deliverable.
- [ ] Open it as the customer would (a private window, signed in as them) before publishing.
- [ ] After publishing, look at the owner's history and the customer's page side by side: the two lists must tell the same story.
- [ ] Look at the outbox in the administration after each step: one message per step, no duplicate.

## Things this work knowingly does not do

* No file upload or download; no preview hosting; no thumbnails; no checking that an address is up.
* No annotation on anything but a picture; no drawing tools; the owner sees positions in words, not as an overlay.
* No "reject" state separate from *ask for changes*; no partial approval; no approval by a second person.
* No reminders or deadlines for a decision.
* No read receipts: the owner sees *last customer activity* (a sent comment, a decision), not that a page was opened.
* No bulk operations across deliverables, and no templates.

## Rollback

Do not use the feature (nothing is created until you make a deliverable), or revert the code. Do **not** drop the tables from a production database without a backup: they are the record of what was approved. See ARCHITECTURE.md.
