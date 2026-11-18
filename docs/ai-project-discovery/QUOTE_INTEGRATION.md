# Quote integration

The discovery plan becomes a quote request through the **existing** workflow (`server/src/modules/ai/quote.ts` and `server/src/modules/quotes/`). Nothing was added to the quote system: no new table, no new e-mail, no new reference format. The request has the same reference (`CC-YYYY-NNNNNN`), the same history and status page, the same notification and the same outbox as every other request; its source is `control_room_ai`.

## The path

```
 visitor edits / confirms in the panel            (nothing leaves the browser except to the discovery API)
        │
 Plan view: "Generate the plan"  ──► immutable version N (draft → snapshot, hash)
        │                             and a ProjectPlan projected for the quote workflow
 Review before sending            ──► what the studio would receive (see below)
        │
 name · e-mail · consent in the PANEL's form          (never in the chat: the model does not see them)
        │ POST /quote-approval  { planVersion }
        ▼
 server: approval recorded, bound to the plan's hash  ──►  assistant is asked "I approved the plan"
        │
 submitApprovedQuoteRequest (the model passes nothing)
        │ server re-checks: approval live and for THIS plan, snapshot read back and verified against its hash
        ▼
 createQuoteRequest(…)  ──► reference, status page, e-mails, administration
```

## What has to be true before the form appears

All of these are checked by the server on approval (and again on submission), and the panel shows the same list:

1. A plan exists and is **up to date** (not stale).
2. A **project type**, an **objective or problem** and **at least one requirement** are recorded.
3. **At least one core requirement (essential or required) was confirmed by the visitor.**
4. Sending through the assistant is switched on (`quoteEnabled`).
5. The plan's version is the one the visitor is looking at (`planVersion`); otherwise **409**.

A missing confirmation is **422** (`requirements: required`); a stale plan is **409** (`plan_stale`). The assistant has no tool that can approve, and `submitApprovedQuoteRequest` takes no arguments.

## No automatic submission

The quote request is created in exactly one place: `submit`, called by the `submitApprovedQuoteRequest` tool after the **visitor's own approval** (their name, e-mail and the acknowledgement, entered in the panel). The assistant cannot send on its own: without a live approval for this plan's hash the tool answers `approval_required`. An approval lives 10 minutes, is for one plan, and is deleted as soon as anything the plan is built from changes.

## The review

The review shows, in the visitor's language, what the studio would receive:

- the **project** (name, type, objective in the overview), the **desired launch**, the **maintenance** wish;
- the **confirmed core requirements**, the **requirements not yet confirmed** (the assistant's suggestions, still marked as such) and the **other confirmed requirements** (important, optional, later);
- the **complexity** — "(not an estimate)" — and the **budget** — "(not a promise)" — as the visitor gave them, or "not given";
- the contact line ("you enter your name and e-mail in the form below, not in the chat; the AI model does not see them"), the privacy line, and that the plan is **not a quote and not a confirmed project**.

There is no price anywhere: the studio's quote is made by a person.

## What the request carries

- The **projected `ProjectPlan`** (project type, goal, audience, required and optional features with "(not yet confirmed)" marks, the architecture proposals, integrations, complexity, timeline, budget idea, overview, dependencies, open questions, next steps), so the administration, the customer's status page and the e-mails show it exactly like any assistant request.
- Additional **brief questions** (`discovery-*`): the discovery plan's version, the classification, the complexity with its first factors, the maintenance wish, every requirement under its priority with category, origin and status, the architecture as proposals, the phases, the risks and the visitor's notes. The administration renders the brief generically, so these appear without a new screen.
- The **version and hash** of the snapshot. On submission the snapshot is **read back from the database and verified against its hash**; if it is missing, altered or no longer the newest of an unchanged draft, the tool answers `plan_changed` and nothing is sent.

## Duplicates

The existing duplicate protection applies: the same visitor sending the same plan twice within the window gets the existing reference back, not a second request.

## The older plan form

When the discovery is switched off, nothing of this applies and the older form behaves as before. While it is on, the older `PUT /plan` refuses a plan that came from discovery (409 `discovery_plan`), so a plan cannot be edited around the confirmation rules.
