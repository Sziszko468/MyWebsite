# Audit log

Two records of what happened, each for a purpose, and **one** audit mechanism: the history of an action is its own timeline (the way a project or a booking has events), and every line of it is also written to the platform's `audit_log`, which is what the operator reads.

The history **distinguishes four things**, by the kind of line and by who is named as the actor:

| What | Kind of line | Actor |
| --- | --- | --- |
| **The AI-generated proposal** | `proposal_created` | `ai` — made for the administrator named in `actor_id` |
| **The administrator's approval** (or rejection, or cancellation) | `approval_granted`, `rejected`, `cancelled` | `admin` — the administrator who decided |
| **The server-side execution** | `execution_started`, `submitted`, `expired`, `approval_invalidated` | `server` |
| **The execution result** | `execution_succeeded`, `execution_failed` | `server` (the code of a failure in the line's detail) |

A retry is a new action whose first line is `proposal_created` with actor `admin` (an administrator, not the assistant, made it) and `retry: true`.

## `ai_action_events`

One row per step of an action's life; **append-only** (a trigger refuses `UPDATE` and `DELETE`).

| Column | Holds |
| --- | --- |
| `action_id`, `seq` | the action and the line's number (1, 2, 3 …, no gap) |
| `kind`, `actor_type`, `actor_id` | the step, who did it (`ai`, `admin`, `server`) and the administrator's id (null for the server) |
| `from_status`, `to_status` | the move the line records |
| `payload_hash` | the hash of the frozen payload (so every line says *which* proposal it is about) |
| `detail_json` | **codes and counts only**, at most 500 characters (a `CHECK`): the failure code, whether a second confirmation was given, the action type |
| `prev_hash`, `hash` | the chain: `hash = SHA-256([prev_hash, action, seq, kind, actor_type, actor_id, from, to, payload_hash, detail, time])`; the first line's `prev_hash` is 64 zeros |
| `created_at` | when |

A line is written **in the same transaction as the move it records**, so a move never exists without its line and a line never exists without its move.

## `audit_log` (the platform's)

For each line above, `audit()` writes `ai_action.<kind>` with entity `ai_action`, the action's reference, the administrator (as actor, for proposals and decisions) and a short detail (`type`, `by`, `to`, and the same codes). Also:

* `ai_action.proposal_refused` — a proposal that was refused (a rule, a secret in the text, too many pending), with the action type and the code; no action row exists for it;
* `ai_action.approval_refused` — an approval that was turned away before it changed anything (`payload_mismatch`, `permission_lost`).
* What the **business function** wrote when it ran is unchanged and under the approving administrator's name: `clients.project_status`, `quote.status`, `booking.closed_days`, the project's history line, and so on.

## What integrity checking proves

`verifyHistory` (and `GET /api/admin/automation/integrity`; each action's page shows the result for that action) checks, for every action:

1. the frozen payload still has its hash;
2. the lines start at 1 with no gap, and the first is `proposal_created`, `null → proposed`;
3. each line's `prev_hash` is the previous line's `hash`, and each `hash` is the one its content gives;
4. every line carries the action's payload hash;
5. each line's `from` is the previous line's `to`, and the move is allowed by the lifecycle;
6. the last line ends where the action's `status` is; an action has a history.

Problems are reported as `payload_hash_mismatch`, `bad_start`, `gap`, `chain_break`, `hash_mismatch`, `event_payload_mismatch`, `transition_invalid`, `status_mismatch`, `missing_history`. Tests drop the triggers on purpose, edit, delete and reorder lines, and require the report to name each.

**What it does not prove:** that nobody with direct write access to the database could rewrite an action's whole history and recompute its hashes. It is tamper-*evident* against edits, removals and reorderings; it is not a signature and not an external witness.

## What is deliberately not in it

Session tokens, cookies, CSRF tokens, API keys, passwords, e-mail addresses, phone numbers, the words a customer wrote, the assistant's draft or note text, the error message of a failed execution. The text of a proposal is in the frozen payload (see [SECURITY.md](SECURITY.md), "Privacy"), not in the history.

## Reading it

* **On the action's page**: the timeline, line by line, with the actor named in words (*AI assistant*, *Administrator · e-mail*, *Server*), the moment, the move, and the failure in words.
* **In the list**: filter the history by status, action, administrator (for those who may read the system), record reference and date.
* **For the operator**: `audit_log` where `action LIKE 'ai_action.%'`.
