# Launch checklist

Nothing here has been deployed, merged into `main` or `deployment/render-cloudflare`, or run against production data. The branch is `feature/controlled-ai-automation` (base `feature/business-intelligence-final-fixes`, `cd55249`). Everything was verified **in development only**, against synthetic rows in throw-away databases, with a scripted model and a local stand-in for Anthropic's API. No real model call, no real e-mail and no external service was used.

## Decide (the owner)

- [ ] **Whether to switch it on at all.** It is off until the operator sets `AI_AUTOMATION_ENABLED=true` and restarts. There is nothing to undo if you never do.
- [ ] **Read the catalogue** ([ACTION_CATALOG.md](ACTION_CATALOG.md)) and confirm the five actions are the ones you want, and that the unsupported list is right. In particular: **a project status change is visible to the customer in their portal** (no e-mail); **a project note cannot be deleted**; **closing days is refused while a booking falls in them** and is the administrator's alone (`system:write`).
- [ ] **Who approves.** Any administrator may decide their own actions, and an administrator (who may write the system) may decide anyone's. An editor can propose and approve what an editor may do (notes, statuses, triage, drafts) but never the consultation hours. There is **no second person** involved; if you want one, that is a separate piece of work.
- [ ] **How long a proposal waits** (`AI_AUTOMATION_TTL_MINUTES`, default 60) and **how many one administrator may have waiting** (`AI_AUTOMATION_MAX_PENDING`, default 20).
- [ ] **Retention and erasure of the proposal text.** The proposal keeps the assistant's draft or note text (and a customer note) in a frozen payload. It is **not** purged by the assistant's conversation retention and **not** removed when a customer is erased by e-mail address, because a frozen row cannot be edited. Decide how long to keep it and how to erase it (a deliberate migration or script, with the history's chain in mind).
- [ ] **Whether the privacy notice needs a sentence** about the assistant preparing actions for administrators. The public notice was **not** changed in this step.
- [ ] **Whether customer data may go to the provider for this**, as for the admin assistant itself (the reasoning in [../ai-admin-assistant/LAUNCH_CHECKLIST.md](../ai-admin-assistant/LAUNCH_CHECKLIST.md) applies unchanged): the assistant reads a record through its tools to propose an action about it.

## Before switching it on

- [ ] **Back up the database.** Migration `0019` is **forward-only** (additive): code older than it refuses to start on a database that has it. Rolling the *code* back means restoring the backup taken before; rolling the *behaviour* back means unsetting `AI_AUTOMATION_ENABLED` (the tables and the history stay).
- [ ] The migration numbers: `0019` follows `0018_ai_admin_assistant` on this lineage. If another branch also added a `0019`, resolve the clash before merging (the runner stops on two files with one version).
- [ ] The admin assistant itself is on and its model is verified (AI → Admin assistant), as before. Automation adds no model call, key, budget or provider.
- [ ] Set `AI_AUTOMATION_ENABLED=true` in the environment you are checking, restart, and open **Administration → Automation**: it should not say "switched off".

## Check (in a safe environment with real data; **not done**)

- [ ] **Propose each of the five actions from the assistant** with a record you know. Open the proposal. Read the preview against what you expected.
- [ ] **A draft reply**: approve it; confirm nothing was sent and nothing changed on the customer's side; copy it and send it from the conversation page yourself.
- [ ] **A project note**: approve it; see it on the project; confirm the customer's portal shows nothing new.
- [ ] **A project status change** (to a working phase, then to Completed): the second confirmation is asked for Completed; the portal shows the status; **no e-mail arrives** (check the outbox/mail log and the customer's mailbox).
- [ ] **A quote request triage move**: the request's internal status changes; the customer's status page does not.
- [ ] **Closing days**: needs the second confirmation; the days disappear from the public booking page; try a day with a booking: it is refused.
- [ ] **Make a record change after a proposal** (move the project in the ordinary screen): approving must fail with "the record changed".
- [ ] **Let one expire** (or lower the TTL): it cannot be approved afterwards.
- [ ] **Reject and cancel** one each.
- [ ] **As an editor**: you see only your own; you cannot get a consultation closing proposed.
- [ ] **In Hungarian, English and Dutch**: read the screen and a proposal in each. *The Hungarian and Dutch were not proofread by a native speaker.*
- [ ] **Dark and light, a phone**, with the keyboard only, and with a screen reader if you can (*not tried here*).
- [ ] `GET /api/admin/automation/integrity` as an administrator: `ok: true`.
- [ ] **Ask the assistant to do something unsupported** (send an e-mail, delete, change a role): it should say it cannot. *This depends on how the real model follows its instructions, which no test here can show; the server refuses regardless.*

## Known limitations

Not tried with the real model · the hash chain is tamper-evident, not a signature (see [AUDIT_LOG.md](AUDIT_LOG.md)) · the proposal text is kept and not purged · approvals are one person, not two · fingerprints are strict, so a harmless change to the record means a new proposal · the project note cannot be deleted · a project's customer note is not forced into the customer's language · no draft storage exists, so an approved draft is kept with the action · `AI_AUTOMATION_ENABLED` needs a restart · hu/nl wording not proofread natively · screen readers, real devices and Safari/Firefox were not tried.

## If something is wrong

Unset `AI_AUTOMATION_ENABLED` and restart: the assistant loses its proposal tools, nothing can be approved or run, and the history stays readable. Proposals that were waiting can still be rejected or cancelled. Nothing is deleted. To remove the feature, revert the branch's commit and restore the backup taken before `0019`.
