# Architecture

## The pieces

```
 browser                                          backend (server/)                                      provider
 ───────                                          ─────────────────                                      ────────
 Control Room (chat)  ── text only ─────────────► /api/ai/chat ──► Assistant (gateway.ts)
   conversationId + the new message               │  tools (closed set, strict schemas):
                                                  │    classifyProjectType · updateDiscoveryStage · extractProjectRequirements
                                                  │    assessProjectComplexity · generateProjectPlan · reviseProjectPlan
                                                  │    summarizeProjectDiscovery · validateDiscoveryCompleteness
                                                  │    (+ the six read tools and submitApprovedQuoteRequest, unchanged)
                                                  ▼
                                      discovery/service.ts ◄───────────── discovery/routes.ts ◄── Discovery panel (React)
                                      (the ONE place that changes                /api/ai/conversations/:id/discovery/…
                                       the draft: validation, ownership,         every write names `expectedVersion`
                                       transactions, versions)
                                                  │
                          ┌───────────────────────┼─────────────────────────────┐
                    stages.ts               complexity.ts                    planner.ts
                    (state machine)         (rules, points)                  (plan snapshot, hash, projection)
                                                  │
                                 SQLite: ai_discovery · ai_discovery_facts · ai_discovery_requirements
                                         ai_discovery_plans · ai_discovery_notes   (all hang off ai_conversations)
                                                  │
                                 plan.ts (ProjectPlan, projected) ──► quote.ts approve / submit ──► quotes/create.ts (reference, outbox)
```

## Who owns what

| Concern | Owner |
| --- | --- |
| The conversation, its owner session, its retention | the existing `ai_conversations` (unchanged) |
| Which stage the discovery is in | the server (`stages.ts`), recomputed from the data after every change |
| What is known about the project, and who said it | the server: `origin` (`visitor` / `assistant`) and `confirmed` / `status` on every value |
| The complexity | the server (`complexity.ts`), computed, never stored |
| The plan | the server (`planner.ts`), stored as immutable versions |
| What is *displayed* and edited | the website, from the state the server returns after every call |
| Confirming, rejecting, editing | the visitor only |
| Proposing | the assistant, through tools, only |

The model never sees an identifier it could use to reach another conversation: every tool call finds the conversation through the **session** it runs for, not through an id the model supplies. Requirement ids in tool inputs are looked up inside that conversation only.

## One conversation, no duplicate storage

`ai_discovery` has one row per conversation that started a discovery, keyed by `conversation_id` with `ON DELETE CASCADE`. The words of the conversation stay in `ai_messages`; the discovery tables hold *structured* data (enumerations the server validates, the visitor's short statements, the requirement titles) and nothing that is a copy of the chat. Deleting a conversation (by the visitor, by "start over", or by retention) deletes the discovery rows in the same transaction (`eraseDiscovery`).

## The tool set

`toolNamesFor(settings)` decides what the model is offered: the six read tools, then either the eight discovery tools (discovery on) or the older `createProjectPlan` (discovery off), then `submitApprovedQuoteRequest` if quotes are on. The set is closed; every tool has a strict input schema (checked before it runs) and a strict output schema (checked before the model sees the result); a result that fails its schema is replaced by a plain error. Tool calls are logged by name, status and duration only: never the inputs or the results.

## The website

`src/ai/controlRoom.ts` is the single store both the floating assistant and the `/control-room` page share. It holds the `DiscoveryState` the server returned, a `discoveryBusy` flag (one change at a time) and the last `discoveryProblem`. Every mutation (`discoveryFacts`, `discoveryType`, `discoverySignals`, `discoveryAdd`, `discoveryChange`, `discoveryRemove`, `discoverySkip`, `discoveryNote`, `discoveryGenerate`) names the version the visitor saw; the answer carries the whole new state, so the panel never merges anything. After every assistant turn the state is read again, because the assistant may have recorded something.

`PlanPanel` chooses between the discovery panel and the older plan form from `config.discoveryEnabled` (part of the public configuration). That configuration is cached by browsers for a minute, so after the administrator flips the switch a page may briefly hold the old answer: when the discovery routes answer 404 the store asks for the configuration again (revalidating, not from the cache) and the panel follows (a browser check flips the switch in the middle of a journey and the older form appears by itself). The form that sends the request (`SendForm`) is shared by both.

## Endpoints (visitor side)

All under `/api/ai/conversations/:id/discovery`, all cookie-free (the session travels in `X-AI-Session`), all refusing an unsafe request from another origin, all rate limited (`aiDiscovery`: 90 per minute), all reaching a conversation only through the visitor's own session.

| Method and path | Does |
| --- | --- |
| `GET /` | The whole state (stage, progress, type, facts, requirements, signals, skipped, notes, complexity, plan and versions, what is missing, whether it was sent) |
| `PUT /facts` | Save facts (`facts`, optional `confirm` list) |
| `PUT /classification` | Choose a project type, or confirm the proposed one |
| `PUT /signals` | Set the complexity characteristics |
| `POST /requirements` | Add a requirement (confirmed, the visitor's) |
| `PUT /requirements/:rid` · `DELETE /requirements/:rid` | Change or remove one |
| `POST /skip` | Skip or take back an optional stage |
| `PUT /notes` | The visitor's note on a plan section |
| `POST /plan` | Make a plan version (all sections or the named ones) |
| `GET /plans/:version` | One stored version, read only |

The older routes are unchanged except: `PUT /plan` refuses a discovery plan (409), and `DELETE /plan` ("start over") now clears the discovery as well.

## Concurrency

Every write carries `expectedVersion`; the draft's `version` goes up by one with every change that does anything. A write that names an older version gets **409** (`discovery_conflict`) and changes nothing; the panel then reloads the state and says so. The same check protects the visitor from the assistant and the other way round. All changes run in a transaction that re-reads the conversation row (a deleted or sent conversation is refused inside it).
