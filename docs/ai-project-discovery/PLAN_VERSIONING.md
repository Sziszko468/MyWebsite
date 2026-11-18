# Plan versioning and the plan editor

## Two version numbers

| Number | Lives in | Moves when | Used for |
| --- | --- | --- | --- |
| **Draft version** (`ai_discovery.version`) | the working draft | *every* change that does something: a fact, the type, a characteristic, a requirement, a skip, a note | optimistic concurrency (`expectedVersion`) and "is the plan out of date" |
| **Plan version** (`ai_discovery_plans.version`) | an immutable snapshot | a plan is generated or regenerated and the content actually differs | the revision history, the approval and the request |

A draft nobody has changed is version 0.

## Immutable snapshots

A plan version is a JSON snapshot of **codes and the visitor's own words** (`PlanContent`, schema 1) with a **content hash** (SHA-256 of a canonical form that leaves out timestamps). It is never edited afterwards. It records *why* it was made (`generate`, or `regenerate:<sections>`), *who* made it (the visitor's button or the assistant's tool) and a **revision summary** against the version before it (sections remade, requirements added, removed or changed, the complexity before and after, facts that changed).

At most **40** versions are kept per conversation (the oldest are pruned); the history in the panel says so by simply listing what is there.

## "Out of date"

Every section of a snapshot is stamped with the draft version it was made from. The plan is **stale** when any section is older than the draft, and the panel says so *by section* ("this section is older than the project"). The plan is **fresh** only when every section is at the draft's version. A stale plan:

- is shown with a plain notice and a *Regenerate the plan* button,
- cannot be approved or sent (`planStale` is one of the things the review lists as missing),
- and any approval that was waiting is deleted by the server the moment the draft changes, so an approval is always for the plan as it is *now*.

## Regenerating

- **The whole plan** (`POST /plan` with no sections, or `generateProjectPlan`): every section is rebuilt from the draft.
- **One or more sections** (`POST /plan` with `sections`, or `reviseProjectPlan`): only those are rebuilt; **every other section is carried over unchanged** from the previous version. Regenerating the architecture never touches what was confirmed in the overview or the requirements, and the complexity of an untouched overview is the one it had.
- A regeneration that produces the **same content** makes no new version (`status: unchanged`); if everything is current the plan is marked fresh again.
- Nothing confirmed is ever lost: confirmation lives in the draft (facts and requirements), not in the plan; regenerating reads it, never writes it. (A browser check confirms the same requirements are confirmed before and after.)

## The visitor's notes

A note on a section is stored in `ai_discovery_notes`, outside the generated text, and copied into every new snapshot. A note counts as a change of the draft (it makes the plan stale, because the plan carries it); regenerating the section it belongs to includes it. Notes are limited to 1,000 characters.

## Reading an older version

`GET /plans/:version` returns one stored snapshot. The panel shows it **read only**: no regenerate buttons, no review, no send form, with a *"You are looking at an older version"* line and a way back. Opening a version does not change anything.

## Concurrency

Every write names `expectedVersion`. If the draft moved on (another tab, or the assistant recorded something), the answer is **409** `discovery_conflict` and nothing changes; the panel reloads the state and tells the visitor in one sentence. The assistant's tools run without an expected version (they act on the current draft) but through the same transaction, so a visitor's edit and an assistant's write are serialised, never interleaved.

## After the request is sent

A conversation that has sent its request is **frozen**: every write answers 409 `sent` (facts, requirements, notes, skips, plan generation), the panel disables its fields and shows the reference, and the request keeps the exact snapshot (version and hash) the visitor approved. "Start over" is refused for a sent conversation; the visitor starts a new conversation instead.
