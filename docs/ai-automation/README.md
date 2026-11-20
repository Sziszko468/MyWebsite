# Controlled AI automation

PROMPT 33 · branch `feature/controlled-ai-automation` (base: `feature/business-intelligence-final-fixes`, `cd55249`).

The AI admin assistant can now **prepare** a small, fixed set of administrative actions. It can never **do** one. A person approves each action with a dedicated control; the server then checks everything again and carries it out through the platform's existing business functions, and every step is written to a history that cannot be edited.

> **This is not an autonomous agent.** It is human-controlled administrative automation. The administrator stays responsible for every operation that runs. The assistant proposes; an administrator decides; the server executes.

```
administrator  ──asks──►  assistant (Claude Haiku 5.5, unchanged)  ──proposes──►  ai_actions  (awaiting_approval)
                                                                                      │
administrator  ──reads it on /admin/automation, uses the approval control──────────────┘
                                   │
                                   ▼
                  server: re-checks session, role, frozen payload, record state ──► existing business function ──► completed | failed
                                   │
                                   ▼
                  history: ai_action_events (hash chained, append only) + the platform's audit_log
```

## The documents

| Document | What it holds |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | What was inspected and reused, what is new, how a proposal travels, decisions not to undo |
| [ACTION_CATALOG.md](ACTION_CATALOG.md) | The five supported actions (permission, parameters, rules, affected records, side effects, reversibility, second confirmation), how each candidate of the brief was judged, and everything that is **not** supported, with why |
| [APPROVAL_WORKFLOW.md](APPROVAL_WORKFLOW.md) | The lifecycle, what an approval is bound to, the checks at approval and at execution, expiry, idempotency, replay, races, failure and recovery, the API |
| [SECURITY.md](SECURITY.md) | What the assistant cannot do and what stops it, prompt-injection handling, privacy, and the limits that remain |
| [AUDIT_LOG.md](AUDIT_LOG.md) | The history of an action, who did each step, the hash chain and what it proves |
| [TEST_RESULTS.md](TEST_RESULTS.md) | The commands that were actually run and what they showed |
| [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) | What the owner decides, what to check before switching it on, what is not verified |

## In one page

* **Off by default.** `AI_AUTOMATION_ENABLED=true` (an operator environment variable) switches it on. With it off the assistant has no proposal tool at all, nothing can be approved, and the screen says so; the history stays readable.
* **Five actions**, no more: keep a draft reply (never sent) · add an internal project note · change a project's status (the customer sees it in the portal, is *not* e-mailed) · move a quote request between its internal working states · close days for consultations. Anything else is listed, with its reason, as unsupported.
* **No action sends an e-mail or a message.** Every call to a business function passes `notify: false` (and `show: false`).
* **Every approval is bound** to the exact action type, target record, parameters and reason (a SHA-256 of the canonical payload), to the administrator who approved it, to an expiry, and to the state of the record when it was proposed. If any of that changed, the approval no longer holds and a new proposal is needed.
* **The server decides, again.** At approval and again immediately before execution it re-reads the session and the role, re-verifies the frozen payload, and re-checks the record.
* **A decision is made once.** Idempotency keys, a conditional state change, database triggers and a single-writer server make a replay, a double click or a race change nothing.
* **A failure changes nothing** (the work and the move to `completed` are one transaction). Recovery is a **new** proposal that needs its own approval.
* **One audit mechanism.** Each step is a line in the action's own timeline (`ai_action_events`) and a line in the platform's `audit_log`.

## Where the code is

| What | Where |
| --- | --- |
| Migration `0019` | `server/src/db/migrations/0019_ai_controlled_automation.sql` (two tables, triggers, no change to an existing table) |
| Model, lifecycle, actions, store, view, routes, tools | `server/src/modules/ai/automation/` (`model.ts`, `lifecycle.ts`, `actions.ts`, `store.ts`, `view.ts`, `routes.ts`, `tools.ts`) |
| Closing days (the one new business function) | `server/src/modules/bookings/admin.ts` (`checkClosure`, `closeDays`) |
| Wiring | `ai/adminassistant/tools.ts` (the proposal tools join only while switched on), `prompt.ts`, `ai/gateway.ts`, `system/maintenance.ts`, `app.ts`, `config.ts`, `http/rateLimit.ts` |
| Screens | `src/admin/pages/AutomationPage.tsx`, `AutomationActionPage.tsx`, `src/admin/automation/`, the proposal card in `src/admin/assistant/Cards.tsx`, styles `styles/automation.module.scss`, words `i18n/automation.ts` (Hungarian, English, Dutch) |
| Tests | `server/test/aiAutomation.test.ts`, `aiAutomationChat.test.ts`, `src/admin/automation/automation.test.ts`, `tools/e2e/automation-journey.cjs`, `tools/audit/audit-automation.cjs` |

## What it deliberately does not do

It has no generic tool: no SQL, no shell, no HTTP, no file access, no "set this field to that". It cannot approve, reject, cancel or run anything itself. It does not change the model (Claude Haiku 5.5 only, no fallback), the key, the budgets or the permissions. It was not run against a real model, real e-mail or production: see [TEST_RESULTS.md](TEST_RESULTS.md) and [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).
