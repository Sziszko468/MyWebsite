# Architecture

## What was inspected, and reused

Nothing below is a second system. The brief asked for no second AI system, authentication system, database, notification provider or audit mechanism; each of these was inspected and reused.

| The platform has | How controlled automation uses it |
| --- | --- |
| **The AI admin assistant** (PROMPT 31/32: `modules/ai/adminassistant/`, 34 read-only tools, strict inputs, `run` pipeline per tool call) | The proposal tools are built into the same tool set by the same `buildAdminTools`, run through the same `run` (session and role re-read, conversation context re-resolved, output guard, tool-call ledger). Same gateway, same conversation store, same prompt builder. |
| **Claude Haiku 5.5 model lock, budgets, ledger** (PROMPT 16.1/29) | Untouched. No model switching, no fallback provider. Proposals add tool calls to the existing ledger; they add no model call of their own. |
| **Admin authentication, sessions, roles, permissions** (`auth/`, `can`, `peekSession`) | The only identity. Proposing needs `assistant:use` plus the action's own permission; approving needs the same, re-checked with the current role. No new role, no new permission. |
| **Existing business functions** (`customers/admin.ts` `setProjectStatus`, `addProjectNote`; `quotes/admin.ts` `changeStatus`; `bookings/admin.ts`) | Execution calls these, with the approving administrator's own session. They check the permission again, apply their own rules, and write their own history and audit lines under that person's name. |
| **The context scope of a conversation** (`adminassistant/scope.ts`) and the readers' lookups (`projectByReference`, `quoteByReference`, `conversationByReference`) | A proposal can target only a record the conversation's context reaches, found by public reference. |
| **Database, migrations, transaction wrapper** (`db/`, savepoints, single writer) | One new migration (`0019`, additive). The synchronous transaction wrapper makes "the work and the move to completed" one atomic unit. |
| **`audit_log` and `audit()`** | Every lifecycle step is also a line there (action `ai_action.<step>`). It is the only audit mechanism; the per-action timeline is a record of the action's own life (like a project's or a booking's events), not a second audit log. |
| **Outbox / notifier** | Not used by actions: none of them sends anything. (The business functions they call would queue an e-mail if asked; the actions never ask: `notify: false`.) |
| **Rate limiter, CSRF, same-origin rule, error format** | The approval routes are ordinary admin routes: cookie session, CSRF token, same-origin, a burst limit of their own (`automation`, 60/minute). |
| **Maintenance run** (`system/maintenance.ts`) | Expires proposals whose time is up, and fails actions a crash left half-way. Nothing is ever deleted. |
| **Admin app, design system, i18n pattern** (`src/admin/`, Racing Red tokens, own-dictionary-per-screen like the assistant's and the analytics') | Two screens, one proposal card in the assistant's chat, one dictionary in three languages. |

## What is new

* **Two tables** — `ai_actions` (the proposal, its frozen content, its lifecycle) and `ai_action_events` (the append-only, hash-chained history). Both carry database triggers (below).
* **The automation module** — `modules/ai/automation/`:
  * `model.ts`: statuses, the transitions, the action catalogue, the list of unsupported actions, failure codes, the canonical-JSON and hashing helpers.
  * `actions.ts`: the five actions, each as `parse` (closed set of keys, each checked), `assess` (the record now, the business rules, the preview, a fingerprint of the state the action depends on) and `execute` (the existing business function).
  * `lifecycle.ts`: propose, approve (and execute), reject, cancel, expire, recover, retry; every move is one conditional UPDATE plus one history line in one transaction.
  * `store.ts`: reads and writes, the history chain, `verifyHistory`.
  * `tools.ts`: the six assistant tools (five proposals and a catalogue); `routes.ts` / `view.ts`: the HTTP API.
* **One business function** — `closeDays` / `checkClosure` in `bookings/admin.ts`: the narrow change to the consultation hours the assistant's action needs (adding one `closed` exception; refusing if a booking falls inside it). `saveHours` is unchanged.
* **Configuration** — `AI_AUTOMATION_ENABLED` (default off), `AI_AUTOMATION_TTL_MINUTES` (default 60), `AI_AUTOMATION_MAX_PENDING` (default 20 per administrator).

## How a proposal travels

1. **The administrator asks** in the assistant ("add a note to PRJ-… that the logo goes on the left"). The conversation has a fixed context; the model has the 34 read tools and, when automation is on, six more.
2. **The model calls a proposal tool** (for example `proposeProjectNote`). The tool call goes through `run`: the session and role are re-read from the database, the conversation and its context are re-resolved. Then the proposal path: the action's permission is checked with the current role; the target is found by its public reference **inside the context**; the parameters are parsed by the action's own strict parser and assessed against the business rules and the record's state *now*; the reason is checked (no amounts, no secrets).
3. **The proposal is frozen**: `payload` (type, target, parameters, reason, language), its SHA-256 `payload_hash`, the `preview` (before and after, affected records, side effects, reversibility, second confirmation), the `fingerprint` of the record's state, an `idempotency_key`, `expires_at`. One transaction: row `proposed` → history line *proposal_created* (actor `ai`, on behalf of the administrator) → row `awaiting_approval` → history line *submitted* (actor `server`).
4. **The tool answers the model** with a summary and the sentence *"NOTHING HAS BEEN DONE … the administrator must open Administration > Automation and approve it"*. The chat shows a **proposal card** (nothing done; a link; no button).
5. **The administrator opens the action's page**, reads why, exactly what changes (before and after), the side effects, whether it can be undone, whether the customer sees it, and the fingerprint their approval is bound to.
6. **They use the approval control.** The request carries the payload hash they were shown, a key for this one decision and, where needed, the second confirmation.
7. **The server approves and executes in one request**: permission first; the hash; the second confirmation; the frozen payload re-verified; the record re-assessed (fingerprint) → `approved` (+ line) → `executing` (+ line) → session and role re-read once more → payload and approval hash re-verified → record re-assessed once more → the business function, in one transaction together with the move to `completed` (+ line). Any failure ends in `failed` with a code, the business data as it was.

## Why the database enforces it too (migration 0019)

| Trigger | What it refuses |
| --- | --- |
| `ai_actions_valid_move` | any status change that is not on the lifecycle |
| `ai_actions_final_is_final` | any change at all to a `completed`, `rejected`, `expired`, `cancelled` or `failed` row |
| `ai_actions_frozen` | any change to the type, target, payload, hash, preview, fingerprint, idempotency key, expiry, owner or creation time |
| `ai_actions_no_delete` | deleting an action |
| `ai_action_events_no_update` / `_no_delete` | editing or removing a history line |
| unique index `ai_actions_one_live` | two live proposals with the same idempotency key |

A bug in the lifecycle code therefore cannot invent a move, and a stray statement cannot rewrite what was approved.

## Decisions not to undo

* **The assistant proposes; it never approves.** There is no tool for approving, rejecting, cancelling or running, and the proposal tool's answer says so. The approval is a `POST` on its own route, taken only by an administrator's cookie session (CSRF + same-origin).
* **Execution uses the approving administrator's session**, not a service identity: the existing functions then check *that person's* permission and write *that person's* name.
* **Approve and execute are one request** (with every transition recorded and each check repeated between them), so there is no window in which an approved action waits to be run by something else. A row left `approved` or `executing` is a crash's leftover and **fails** (`interrupted`); it is never run later.
* **Recovery is a new proposal.** A final row never changes; a failed action whose failure was not its content (`execution_error`, `interrupted`) can be proposed again as a new action that points at it and needs its own approval (at most three in a chain).
* **A closed, small set.** Five actions. An action that cannot be made safe stays out and is listed with why.
* **Fingerprints are deliberately strict.** If anything the action depends on changes (even something harmless), the approval is invalidated and a new proposal is asked for. Safe, occasionally annoying: the cost is one more proposal.
* **No action touches the customer's inbox.** `notify: false` / `show: false` in every call; the actions that would e-mail a customer are not supported.
* **Off by default and independent of the assistant's own switch.** The operator's environment variable is the master; it changes no model, key, budget or permission.
* **The proposal tools join the tool set only while it is on.** With it off, the 34-tool assistant of PROMPT 31/32 is exactly what it was, and its tests are unchanged.
