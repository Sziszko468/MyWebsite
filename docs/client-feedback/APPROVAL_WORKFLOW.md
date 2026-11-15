# Approval workflow

**Only the customer approves, only on request, and only one exact version.** Opening a page, looking at a preview, sending feedback, replying, or a day going by is never an approval.

## The state machine

```
                 ┌──────────────── approve (explicit confirmation of THIS version) ───────▶ approved   (final)
                 │
 requested ──────┼──────────────── ask for changes (an explanation is required) ───────────▶ changes_requested (final)
 (one at a time) │
                 ├──── the customer: "I am not ready to decide" ─────────────────────────▶ cancelled, closed_by customer (final)
                 ├──── the owner: cancel the request, or archive the deliverable ────────▶ cancelled, closed_by admin / system (final)
                 └──── a newer version is published ─────────────────────────────────────▶ superseded, closed_by system (final)
```

* **Requested** by the owner (`POST …/approvals`) for the **current published version**. Refused if the deliverable is not published (`not_published`), another request is waiting (`approval_open`), or that version was already approved (`already_approved`). The request may carry a word for the customer (up to 1000 characters). The customer is e-mailed once.
* **One open request per deliverable**, and **one approval per version**, enforced by partial unique indexes: two requests at the same moment cannot both be made, two approvals cannot both be recorded.
* **Final means final.** Once a request leaves `requested`, a trigger refuses any change to it. The history of requests is a record, not a status field that is overwritten.

## How a customer approves

1. The page shows an **Approval** panel only when the server says this customer can decide now (a request is waiting, the deliverable is open). It names the version (*"We ask for your approval of this version: version 2"*) and shows the owner's word.
2. **Approve this version…** opens a dialog that names the version and its title and says it does **not** approve any later version. There is a **confirmation tick** (*"I confirm that I approve version 2"*) and a button. Pressing the button without the tick says so in words and sends nothing.
3. The request that is sent carries `{ confirm: true, versionNumber, checksum, revision }`. The server refuses unless `confirm === true`, the request is still `requested` (else `invalid_transition`/`superseded`), the `revision` is the one the customer saw (else **409 `stale`**, and the page refreshes), the version is **still the current published one** (else `superseded`), and the **number and fingerprint match** what the request is about (else `version_mismatch`).
4. Recorded in one transaction: the state, the time, the customer, the **confirmed number and fingerprint**, the history line (*"Approved (version 2)"*), the review state, and the owner's e-mail.

## Asking for changes

*Ask for changes…* needs an **explanation** of 3 to 2000 characters (*"Write at least a few words"* otherwise). It is kept as written, shown to the owner as text, and the owner is e-mailed once. The deliverable's review state becomes `changes_requested`. The owner makes a new version and may ask again.

## "I am not ready to decide"

The customer can withdraw a request without deciding. It is recorded (`cancelled`, `closed_by customer`, history *"You withdrew the approval request"*), the owner can ask again, and nothing is approved or rejected. **This is how this project reads "reject"**: there is no separate "reject" state, because a refusal needs words, and that is *ask for changes*.

## Concurrency and races, by example

| Race | Outcome |
| --- | --- |
| The customer double-clicks *Approve* | one `UPDATE … WHERE state = 'requested' AND revision = ?` wins; the second finds nothing and is told the request was already decided |
| The owner publishes version 3 while the customer is approving version 2 | the request is superseded in the publish transaction; the customer's click answers *"A new version was published meanwhile"*, nothing is approved |
| The customer approves while the owner cancels | whichever commits first wins; the other gets `invalid_transition` |
| An old tab confirms a version that is no longer current | `superseded` or `version_mismatch`; the page refreshes |
| Two requests are made at once | the second hits the one-open-request index and is refused (`approval_open`) |

## The review state the customer and the owner see

| `review_state` | Meaning | Customer sees |
| --- | --- | --- |
| `not_submitted` | nothing asked yet | *Ready for you to look at* |
| `awaiting_customer` | a request waits | *Waiting for your approval* |
| `changes_requested` | the customer asked for changes on the current version | *You asked for changes* |
| `approved` | the current version is approved | *Approved* |
| `superseded` | a newer version replaced what was reviewed; no decision on it yet | *A new version, no decision yet* |

The rule that derives it is in DATA_MODEL.md. A **new version never inherits an approval.**

## What the owner can read afterwards

*Approval history* on the deliverable lists every request newest first: the version, the state, who closed it, when, the owner's word, the customer's explanation, and for an approval *"The customer confirmed version 2, fingerprint 3fa…"*. The full history lists every step with who took it and whether the customer can see the line.

## What this is not

It is **not an electronic signature** and not legal evidence by itself: it is a record, in the owner's own database, that a signed-in customer confirmed one version at one time. If a contract needs a signature, that is a different process.
