# Permissions

The assistant has **no authority of its own and no blanket administrator override**. It acts with the signed-in administrator's authority, re-checked each time it is used, and it never weakens a permission the system already had.

## What the permission system can express

Two roles and a short list of permissions, enforced inside the business functions (`modules/auth/permissions.ts`):

| Role | Grants relevant here |
| --- | --- |
| `admin` | `requests:read`, `clients:read`, `system:read`, `system:write`, … and `assistant:use` |
| `editor` | `requests:read`, `clients:read`, `clients:projects`, … and `assistant:use` (no `system:*`) |

A permission opens a whole **domain** (all quote requests, all customers); there is **no per-record ownership or assignment** in the system. So the honest statement is: *an administrator who may read customers may read every customer*, and the assistant can show them nothing more and nothing less.

`assistant:use` is the **only permission this work added** (one line in the grant table, and one word in the admin app's `Permission` type). It opens no data: it lets an administrator *use the assistant at all*, and exists so that the owner can take the assistant away from a role by editing that one table. Nothing else in the table changed.

## What each tool checks

Every call checks `assistant:use`, then the permission of the data it reads, with the **role stored in the database now**:

| Data | Permission | Tools |
| --- | --- | --- |
| Quote requests, quotations, consultations | `requests:read` | the quote and consultation tools; the quote/consultation parts of the business tools |
| Customers, client projects, tasks, customer conversations | `clients:read` | the project, customer and conversation tools; the project/conversation/customer parts of the business tools |
| The assistant's usage numbers | `system:read` | `GET /usage` (administrators; an editor gets 403) |
| The assistant's switch and limits | `system:write` | the existing `PUT /api/admin/ai/settings` (administrators; an editor gets 403) |

The business tools (overview, activity, alerts, briefing, business reports) build each *part* only if the current role may read the data behind it. A part that is not allowed is reported as `{ available: false, reason: "not_available_to_you" }` **with no number**, and the alert list says which area was left out (`notAvailableToYou`), so an administrator is never shown an "all clear" that is really "you cannot see this".

## Immediate effect

There is no cache of authority. Each tool call re-reads the session and the user (`peekSession`, which does not touch the session: reading does not extend it), so:

- a **sign-out**, an **expired** or **idled-out** session, or a **disabled account** stops the next tool call of an answer already being written (`session_ended`);
- a **role changed in the middle of an answer** applies to the next call;
- a permission taken away from a role applies at once (the tests change the policy between two calls of one answer).

## No oracle for what exists

A tool without permission answers `not_available` with **no title, no count and no hint that the record exists**; a record that is outside the conversation's context answers `not_found`, exactly as one that does not exist. Tests compare the answers for an existing and an invented reference with the permission denied and with it granted: they are identical. Search results are filtered by the same permission (and, in a record context, by the context's scope) *before* anything is counted.

## What is not available, and why

| Wished-for | State | Why |
| --- | --- | --- |
| Limiting an administrator to *some* customers or projects | **Not available** | The permission system has no per-record rule to evaluate. The assistant does not invent one. If it is ever added, the readers already take a `Scope` (ids a conversation may reach) and a `Policy` — that is where it would plug in |
| Reading private notes only for those allowed to read them | **Not available** | Notes are never read by the assistant. (A draft could otherwise quote one to a customer.) |
| An administrator acting for another | **Not possible** | The identity is the session; no tool, no body field and no model output can name another administrator |
| Sending, changing or deleting on a user's behalf | **Not possible** | No tool exists |

## Where it is tested

`server/test/aiAdminTools.test.ts` → *permissions: checked again at every call*: a stricter policy without `clients:read`, without `requests:read`, without `assistant:use`; a permission taken away between two calls; a role changed between two calls; sign-out, expiry and a disabled account; identical answers for real and invented references. `server/test/aiAdminApi.test.ts` → *who may call it*: every route answers a visitor, a customer and a stranger 401; the CSRF token and same-origin are required; a role without `assistant:use` is refused before a conversation, a ledger row or a model call exists. `tools/e2e/admin-assistant-journey.cjs` → *J*: an editor may use the assistant and may not read the numbers or change the switch.
