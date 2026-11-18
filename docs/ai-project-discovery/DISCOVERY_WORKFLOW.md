# Discovery workflow

The workflow is a **server-owned state machine** (`server/src/modules/ai/discovery/stages.ts`). The assistant does not move it by announcing a stage: it records facts, requirements and characteristics through its tools, and the stage follows from the data. This is what makes it adaptive (it never asks again what is known), safe (a model that loses track cannot put the conversation in an impossible state) and testable (27 tests of the engine alone).

## The thirteen stages

| # | Stage | Done when | Skippable | Does not apply to |
| --- | --- | --- | --- | --- |
| 1 | `idea` | anything is recorded (a type, a fact or a requirement) | no | – |
| 2 | `type` | a project type is recorded (a proposal counts; the visitor confirms it) | no | – |
| 3 | `goal` | an objective or a problem is recorded | no | – |
| 4 | `audience` | the audience is recorded | **yes** | – |
| 5 | `requirements` | at least one live (not rejected) requirement exists | no | – |
| 6 | `features` | a requirement that is not essential exists | **yes** | – |
| 7 | `infrastructure` | an existing site or system is recorded | **yes** | – |
| 8 | `complexity` | at least three characteristics are recorded | **yes** | portfolio, business website (their assessment is made from the requirements without asking) |
| 9 | `budget` | a budget idea is recorded (never suggested by the assistant) | **yes** | – |
| 10 | `timeline` | a desired launch is recorded | **yes** | – |
| 11 | `maintenance` | a maintenance need is recorded | **yes** | – |
| 12 | `summary` | a plan exists | no | – |
| 13 | `plan` | a plan exists and is up to date | no | – |

Every stage has one of five states in the interface: **done**, **current**, **to do**, **skipped**, **not needed for this project**.

## How the current stage is chosen

1. Stages that do not apply to the project type are marked `not_applicable` and never asked about.
2. The **current** stage is the first applicable stage that is neither done nor skipped.
3. `summary` becomes current when every question stage is finished (done or skipped) and no plan exists yet.
4. Once a plan exists the visitor has chosen to look at it: optional questions that were never answered stay "to do", but they no longer hold the conversation back.
5. `plan` is current when the plan is out of date because something changed after it was made.

Because the stage is recomputed from the data, a visitor who volunteers three things in one sentence moves three stages forward; a visitor who deletes the only requirement moves back to `requirements`.

## One question at a time

Each answer of a discovery tool carries a **guidance** object for the model: the current stage, a one-line instruction for it, and a few *topics* worth asking about for this project type (for example, for a booking platform: what is booked, availability, customer accounts, notifications, payments). The system prompt tells the model to follow that guidance, to ask **one** question, to reflect what it heard in a sentence, and never to run a questionnaire. These topics are instructions to the model, not interface text; it asks in the visitor's language.

## Skipping

Only the seven optional stages can be skipped. A skip is stored on the draft (`skipped`), shown in the progress list, and can be taken back ("Answer after all"). The assistant may skip a stage the visitor declined (`updateDiscoveryStage.skipStages`) or revisit one (`revisitStages`); the visitor does it with the buttons in the progress list. A required stage cannot be skipped: the server refuses, and the interface shows no button.

## What a plan needs, and what an approval needs

- **To make a plan version** (`missingForPlan`): a project type, an objective or a problem, and at least one requirement. Without them the "Generate the plan" button is disabled and says what is missing.
- **To approve sending** (`missingForApproval`): the above, an up-to-date plan, and **at least one core requirement (essential, or required) that the visitor themselves confirmed**. A plan made only of the assistant's suggestions can be generated and read, but it cannot be sent.

## The assistant's tools by stage

| Stage | Tool |
| --- | --- |
| `idea`, `type` | `classifyProjectType` |
| `goal`, `audience`, `infrastructure`, `budget`, `timeline`, `maintenance` | `updateDiscoveryStage` (facts, skips) |
| `requirements`, `features` | `extractProjectRequirements` |
| `complexity` | `assessProjectComplexity` (records the characteristics; the assessment itself is computed) |
| `summary` | `summarizeProjectDiscovery` (what is known and by whom), `validateDiscoveryCompleteness` (what is missing for a plan and for an approval, what waits for the visitor, the next action) |
| `plan` | `generateProjectPlan`, `reviseProjectPlan` (regenerate named sections) |

The eight tools and their limits are described in [SECURITY.md](SECURITY.md); the data they write in [REQUIREMENTS_MODEL.md](REQUIREMENTS_MODEL.md) and [PROJECT_CLASSIFICATION.md](PROJECT_CLASSIFICATION.md).
