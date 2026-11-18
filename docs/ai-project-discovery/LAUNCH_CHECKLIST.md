# Launch checklist and honest limitations

Nothing in PROMPT 30 was deployed, merged or configured anywhere. This is what the owner has to decide or do, in the order it matters, and what the work does **not** prove.

## Before the branch is merged

- [ ] **Read the branch's diff** (`feature/ai-project-discovery`, based on `feature/ai-production-activation`). The migration (`0017_ai_project_discovery.sql`) is additive: five new tables, no change to an existing one.
- [ ] **Understand the migration's one-way nature.** As with every migration of this project, code older than `0017` refuses to start on a database that has it (an unknown newer schema is refused on purpose). Deploy code and migration together; the way back is to restore the backup taken before the deploy, not to run old code on the new database.
- [ ] **Run the whole suite on the merge result** (the numbers in [TEST_RESULTS.md](TEST_RESULTS.md) are for this branch alone).

## Before the discovery is switched on for visitors

- [ ] **Try it with the real model, once, by hand.** Every end-to-end check used the local stand-in for Anthropic's API, which *plays* the assistant from markers in the message. It proves that the integration speaks to the provider correctly and that the server enforces its rules whatever the model sends. It proves **nothing** about how Claude Haiku 5.5 behaves: whether it calls the tools at the right moments, asks one question at a time, marks its own ideas as suggestions (`statedByVisitor: false`), respects a refusal, and keeps the conversation natural. Have a real conversation in three languages and read it. (`ai check --live` exists for the connection; it needs the owner's key and was not run.)
- [ ] **Watch the cost of the first days.** A discovery turn can call a tool or two (each tool result goes back to the model), so a discovery conversation uses more tokens than a plain answer. The budgets, ceilings and the per-turn tool limit from PROMPT 29 apply unchanged; check the AI screen's Operations tab after the first conversations and adjust `maxToolCalls` or the budgets if needed.
- [ ] **Have the Hungarian and Dutch texts read by a native speaker** (the panel, the plan's labels, the privacy sentence). They passed the automated spelling, glossary and register checks, which is not the same.
- [ ] **Read the privacy notice's new sentence** and the retention setting; confirm the wording is what you want to promise (see [PRIVACY.md](PRIVACY.md)).
- [ ] **Look at the complexity tables** ([COMPLEXITY_ASSESSMENT.md](COMPLEXITY_ASSESSMENT.md)) and the architecture rules ([PROJECT_PLAN.md](PROJECT_PLAN.md)) and change anything that does not match how the studio really judges a project. They are written to be read and changed (`complexity.ts`, `planner.ts`), and the tests will tell you what a change breaks.
- [ ] **Try it on real phones.** The layout was measured in an emulated phone (320 to 1440 px, dark and light, three languages, axe) in Chrome only. Nothing was run in Safari or Firefox or on a physical device, and no screen reader was used.
- [ ] **Decide the switch.** `AI_DISCOVERY_ENABLED` (default on) and the *Features* switch on the AI screen. Turning it off brings the older plan form (and the older `createProjectPlan` tool) back at once and deletes nothing the discovery stored. A conversation that already holds a *discovery* plan shows that plan in the older form but cannot edit it there (the older edit answers 409 `discovery_plan`): that visitor starts over, or sends it. Turning it back on shows the discovery again, intact. The public configuration is cached by browsers for 60 seconds, so a visitor who already has the page open may see the old state for up to a minute; the panel notices by itself when the discovery routes stop answering and switches over.

## What the work does not do (by design or by scope)

- **The assistant cannot change what the visitor confirmed.** A visitor who only chats and says "actually, make it a shop" gets an assistant that proposes a new requirement, or tells them to change the type in the panel. This protects the visitor's decisions; it asks them to open the panel.
- **Regenerating one section leaves the others "out of date"** until they are regenerated too (the plan is fresh only when every section matches the draft). This is honest but can feel fussy; "Regenerate the plan" refreshes everything.
- **A conflict is detected, not merged.** If the draft changes in another tab, the panel reloads the true state and asks the visitor to repeat the change. Text typed in the facts form survives a reload (only the visitor's edits are held in the form).
- **No admin editor for a visitor's discovery** and no screen that shows one: by design, the administration sees counts only. The studio sees the plan in the quote request, if the visitor sends it.
- **The plan is built by rules.** It is consistent and cannot invent, but it does not write prose and it is only as good as the requirements recorded.
- **The plan's text is not edited as free text.** The visitor edits what the plan is built *from* (the type, the facts, the characteristics, every requirement) and adds their own note to any section; the sections then regenerate. Free-text editing of a generated section would let the plan say things the confirmed data does not, which is exactly what the confirmation rules prevent.
- **At most 60 requirements and 40 plan versions per conversation.**
- **No download or print of the plan** for the visitor (the quote request carries it).
- **The administration's new switch and counters are English and Hungarian** (the administration has no Dutch).
- **`/control-room` stays a public, indexable page** (it holds no visitor data); this work did not change its robots rules.

## What was not verified

- **No real Anthropic call**, no production traffic, no real e-mail delivery, no Render or Cloudflare involvement; production is older than the code of several earlier prompts (see the earlier audits), so what runs live today has none of this.
- **The migration was applied to empty and scratch databases** (and to the project's migration tests), **not to a copy of the production database**.
- **Load**: nothing was measured under concurrent visitors beyond the rate-limit tests.
- **Accessibility** was checked with axe (WCAG 2.2 AA and best-practice rules) in the states listed in [TEST_RESULTS.md](TEST_RESULTS.md) and by keyboard in a few flows; it is not a manual assistive-technology review.

## What was not touched

`main`, the deployment branches and the earlier feature branches; Render and Cloudflare configuration; any API key (none was requested, printed or committed); the model lock; the quote system's tables and e-mails.
