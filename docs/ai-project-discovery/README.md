# AI Project Discovery

PROMPT 30 extends the existing **CONTROL ROOM AI** ([../ai/README.md](../ai/README.md)) with a guided *project discovery*: instead of one free-form plan form, the visitor and the assistant work through a structured, adaptive conversation that ends in a personalised project plan, which can become a quote request **only when the visitor says so**.

It is an extension, not a second system. There is no second app, database, authentication, e-mail provider, AI provider or model: the assistant is still **Claude Haiku 5.5** (the lock is untouched), the data lives in the same SQLite database behind the same migrations, the visitor is still the anonymous HMAC session, and the quote request goes through the existing quote workflow, reference and outbox.

> Nothing here is deployed. The branch is `feature/ai-project-discovery` (based on `feature/ai-production-activation`). `main` and the deployment branches were not touched, and no Render or Cloudflare configuration was changed. **No real Anthropic call was made**: every end-to-end check used the local stand-in for the provider (see [TEST_RESULTS.md](TEST_RESULTS.md)).

## What the visitor gets

- A **Project discovery** panel next to the conversation (on the `/control-room` page and in the floating assistant) with three views: **Project** (type, facts, characteristics, complexity), **Requirements** and **Plan**, and a progress bar over thirteen steps.
- The assistant asks one question at a time and *records* what it understood through eight tools. Everything it records is shown as **a suggestion that is not confirmed** until the visitor confirms it. The visitor can correct, confirm, reject, restore, add, remove and re-prioritise anything, mark requirements as "later", and skip optional steps.
- A **rule-based complexity assessment** (small / medium / large / complex) with the reasons listed. It is never an estimate of hours or a price.
- A **personalised plan** (overview, requirements, architecture *proposals*, phases, risks and dependencies, next steps) in **immutable versions**, regenerated as a whole or by section, with the visitor's own notes kept.
- A **review before sending**, and the existing approval form. Nothing is sent without the visitor's explicit approval.

## Where it lives

| Part | Location |
| --- | --- |
| Migration (five additive tables) | `server/src/db/migrations/0017_ai_project_discovery.sql` |
| Discovery module (state machine, complexity, plan generator, store, service, tools, routes, labels) | `server/src/modules/ai/discovery/` |
| Wiring (tool set, prompt, quote workflow, retention, settings, rate limit) | `server/src/modules/ai/{tools,prompt,quote,plan,store,routes,settings}.ts`, `server/src/config.ts`, `server/src/http/rateLimit.ts` |
| Website: panel | `src/components/ai/discovery/` (`DiscoveryPanel`, `ProgressList`, `ProjectTab`, `RequirementsTab`, `PlanTab`, `Discovery.module.scss`) |
| Website: state, client, model | `src/ai/controlRoom.ts`, `src/ai/discoveryClient.ts`, `src/ai/discoveryModel.ts`, `src/ai/useDiscoveryText.ts` |
| Words (HU / EN / NL) | `src/content/ai/discovery.ts`, `src/content/ai/discoveryLabels.ts` (generated, see [LOCALIZATION.md](LOCALIZATION.md)) |
| Administration | the **Features** switch and two counters on the AI screen (`src/admin/pages/AiPage.tsx`, `server/src/modules/ai/admin.ts`) |
| Checks | `server/test/aiDiscovery*.test.ts`, `src/ai/discoveryText.test.ts`, `src/components/ai/discovery/DiscoveryViews.test.ts`, `tools/e2e/discovery-journey.cjs`, `tools/audit/audit-discovery.cjs` |

## The documents

| Document | What it says |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The pieces, who owns what, the data flow, the endpoints, concurrency |
| [DISCOVERY_WORKFLOW.md](DISCOVERY_WORKFLOW.md) | The thirteen stages, how the server moves through them, skipping |
| [PROJECT_CLASSIFICATION.md](PROJECT_CLASSIFICATION.md) | The eleven project types and the rule "the assistant proposes, the visitor confirms" |
| [REQUIREMENTS_MODEL.md](REQUIREMENTS_MODEL.md) | The structured requirement: fields, priorities, origin, status, limits |
| [COMPLEXITY_ASSESSMENT.md](COMPLEXITY_ASSESSMENT.md) | Every factor, every point, the thresholds, the floors, what it is not |
| [PROJECT_PLAN.md](PROJECT_PLAN.md) | What the plan contains and how each section is made |
| [PLAN_VERSIONING.md](PLAN_VERSIONING.md) | Immutable versions, staleness, section regeneration, history, optimistic concurrency |
| [QUOTE_INTEGRATION.md](QUOTE_INTEGRATION.md) | From review to approval to the existing quote request |
| [SECURITY.md](SECURITY.md) | What the server enforces, threat by threat |
| [PRIVACY.md](PRIVACY.md) | What is stored, what the model sees, retention and deletion |
| [LOCALIZATION.md](LOCALIZATION.md) | Hungarian, English, Dutch: where the words are and how they are checked |
| [TEST_RESULTS.md](TEST_RESULTS.md) | What was run and what it showed, with the limits of each check |
| [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) | What the owner has to do, and the honest limitations |

## Switching it

The discovery is **on by default** (`AI_DISCOVERY_ENABLED`, default `true`; the administrator can change it on the AI screen under *Features*). It needs the planner. When it is off, the assistant offers the older `createProjectPlan` tool and the website shows the older plan form, exactly as before PROMPT 30. A plan that was started in discovery stays a discovery plan: the older "edit the whole plan" endpoint refuses it.

## Decisions worth knowing (not to be undone lightly)

1. **The server owns the state.** The model records through tools and the server validates every value; the browser never sends history; the panel only displays and edits what the server holds.
2. **The assistant can never confirm anything, and can never overwrite what the visitor wrote, confirmed or rejected.** The refusal is returned to the model as a result it is told to respect; the visitor changes such things in the panel.
3. **The plan is built by rules, not by the model.** Generating or regenerating a plan makes no model call and cannot invent anything; the same draft always gives the same plan.
4. **A plan version is an immutable snapshot.** The approval is bound to its hash; the request that is sent preserves exactly that snapshot.
5. **No price, no hours, no dates are ever produced.** The complexity says how much there is to think about, and says so.

## Known limits (details in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md))

- The assistant cannot change something the visitor confirmed; the visitor has to use the panel. This is deliberate, but a visitor who only chats must be told to open the panel.
- The administration screen is English and Hungarian only (as the rest of the administration); the visitor-facing panel is Hungarian, English and Dutch.
- Nothing was tried against the real Anthropic API or in production.
