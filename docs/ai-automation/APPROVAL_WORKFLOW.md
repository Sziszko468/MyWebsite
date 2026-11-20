# Approval workflow

## The lifecycle

```
proposed ─► awaiting_approval ─► approved ─► executing ─► completed
   │               │ │ │ │           │            │
   │               │ │ │ └► expired  └────────────┴──► failed
   │               │ │ └──► cancelled
   │               │ └────► rejected
   └──► failed / cancelled   (failed from awaiting_approval = the approval no longer holds)
```

`completed`, `rejected`, `expired`, `cancelled` and `failed` are **final**: nothing changes a row in one of them (the database refuses it).

| From | To | Who | Line in the history |
| --- | --- | --- | --- |
| *(nothing)* | `proposed` | the assistant, for an administrator | `proposal_created` (actor **ai**) |
| `proposed` | `awaiting_approval` | the server | `submitted` (server) |
| `awaiting_approval` | `approved` | an administrator, with the approval control | `approval_granted` (**admin**) |
| `awaiting_approval` | `rejected` / `cancelled` | an administrator | `rejected` / `cancelled` (admin) |
| `awaiting_approval` | `expired` | the server, at `expires_at` | `expired` (server) |
| `awaiting_approval` | `failed` | the server, when the approval no longer holds | `approval_invalidated` (server) |
| `approved` | `executing` | the server | `execution_started` (server) |
| `executing` | `completed` | the server | `execution_succeeded` (server) |
| `approved` / `executing` | `failed` | the server | `execution_failed` (server) |

Every move is **one conditional `UPDATE … WHERE id = ? AND status = ?`** plus the row's new columns, one history line and one audit line, in one transaction. If the row is no longer in the status the code believed (another request got there first), the update changes nothing and the request is refused with `state_changed`. The migration's trigger refuses any move that is not on the table above.

## What an approval is bound to

* the **action type** and the **target record** (its kind, internal id and public reference);
* the **exact parameters** and the assistant's **reason**;
* the **payload hash**: the SHA-256 of the canonical JSON of `{ v, type, target, params, reason, language }` (keys sorted, so the same content always has the same hash);
* the **preview** the administrator saw (before and after, side effects, reversibility);
* a **fingerprint** of the part of the target's state the action depends on, taken at the proposal;
* the **expiry** (default 60 minutes after the proposal; `AI_AUTOMATION_TTL_MINUTES`);
* the **administrator who approved** (`decided_by`), the **second confirmation** if there was one, and the key of the decision.

The content columns are frozen by a trigger. The approval request carries the hash of the payload the screen showed; the server compares it with the frozen one (`payload_mismatch` otherwise) and recomputes the hash from the stored payload before running (`payload_tampered` if a row was edited by hand).

## What is checked, and when

| Check | At proposal | At approval | Immediately before execution |
| --- | --- | --- | --- |
| Signed in, session not ended or idle | yes (every tool call) | yes | yes |
| `assistant:use` and the action's permission, with the **current** role | yes | yes (before anything about the payload) | yes |
| Operator's switch is on | yes | yes | yes |
| The approver may decide this action (their own, or may write the system) | — | yes | yes (the approver is the same person) |
| Not expired | — | yes | — |
| Payload hash matches what was shown | — | yes | yes (recomputed from the stored payload; also the approval's hash) |
| Second confirmation, if the action needs one | — | yes | — |
| Parameters re-parsed (closed keys, texts, lengths) | yes | yes | yes |
| Target exists, inside the context, business rules allow it | yes | yes | yes |
| **Fingerprint** of the target equals the proposal's | (taken) | yes | yes |

Anything that fails at approval because the world changed (`target_changed`, `invalid_transition`, `bookings_in_range`, `target_missing`, `validation_failed`, `payload_tampered`) **fails the action** with that code and says why; it needs a **new proposal**. A permission that is gone is a `403` that changes nothing; the action stays waiting for someone who may.

## Idempotency, replay, duplicates and races

* **Proposing.** The same proposal (same administrator, conversation, type, target and parameters) while one is still going returns that proposal (`duplicate: true`) instead of making another. (A unique index on `idempotency_key` for live statuses.)
* **Deciding.** The screen makes a **key per decision** and sends it. The same key again from the same administrator on an action that has been decided is *the same decision*: the answer is what it already is (`200`), never a second execution and never a second history line. A different key on a decided action is `409 not_awaiting_approval`.
* **Replay.** A captured approval request has the payload hash of its own action: against another action it is `409 payload_mismatch`; against a finished one it is a no-op (same key) or `409` (another key); against another administrator it is `409`. An approved payload cannot run again: proposing the same thing after it was done makes a *new* proposal that needs its own approval.
* **Races.** The server runs one statement at a time against one database connection, and each approval is one synchronous unit; the conditional `UPDATE` makes a second request in the same instant lose. Four simultaneous requests (three approvals, one rejection) produce exactly one decision.

## Expiry

A proposal not decided within its time becomes `expired` (by the clock, on every read and on every decision attempt, and in the maintenance run). An expired proposal can never be approved. Nothing is deleted: the proposal and its history stay readable.

## Failure and recovery

* The business function and the move to `completed` are **one transaction**. A function that fails half-way leaves nothing behind; the action becomes `failed` with a code (`execution_error`, or the specific one) and **the error's own words are not kept**.
* A crash between the claim and the end leaves a row `approved` or `executing`. After two minutes the maintenance run, or the next read, moves it to `failed` (`interrupted`). It is **never run later**: no one approved it to run later.
* **Recovery is a new proposal.** For a failure that was not the content's (`execution_error`, `interrupted`), the administrator can **propose it again**: a *new* action with the same frozen payload, assessed again against the record as it is now, waiting for a new approval; the failed one stays failed and the new one points at it (`retry_of`). At most three in a chain. A failure that *was* the content's (the record changed, a rule says no, the permission was lost) is never retried: ask the assistant for a new proposal.

## The API

All under `/api/admin/automation`, administrator cookie session, CSRF token and same-origin on every `POST`, no CORS. Every route needs `assistant:use`. An administrator sees their own actions; one who may read the system sees everyone's. Another administrator's action is **404**, not 403.

| Route | What |
| --- | --- |
| `GET /config` | `enabled`, `ttlMinutes`, `maxPending`, `seesAll`, the catalogue with what this role may do, the unsupported list, the administrators (for those who see all) |
| `GET /actions?tab=pending\|history\|all&status=&type=&admin=&target=&from=&to=&page=&pageSize=` | the list; an unknown value is `422` |
| `GET /actions/:reference` | one action in full: payload view, preview, decision, execution, history, and the integrity of its history |
| `POST /actions/:reference/approve` | `{ payloadHash, idempotencyKey, secondConfirmation? }` → the action as it ends up (`completed`, or `failed` with a code) |
| `POST /actions/:reference/reject` | `{ note? }` |
| `POST /actions/:reference/cancel` | `{}` |
| `POST /actions/:reference/retry` | `{}` → `201`, a new proposal |
| `GET /integrity` | the integrity report of every history (administrators who may read the system) |

Refusals carry a machine reason in `error.details.reason`: `not_awaiting_approval`, `payload_mismatch`, `state_changed`, `automation_disabled`, `not_retriable`, `too_many_retries`, `not_cancellable`, or a failure code. The screen words each in the language of the screen.

## The screen

`/admin/automation`: **Waiting for a decision**, **History** (filters: status, action, administrator, record, dates; the tab, filters and page live in the address) and **What it can do** (the catalogue and the unsupported list). `/admin/automation/ACT-…`: why, what changes (a before/after table), the text, the side effects, whether it can be undone, whether the customer sees it, whether a second confirmation is needed, the fingerprint, the decision controls and the history. The second confirmation is a checkbox the approval waits for (and the server insists on). Text written by the assistant or a customer is shown as text, never as markup.
