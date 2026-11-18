# Complexity assessment

`server/src/modules/ai/discovery/complexity.ts`. A **transparent, rule-based** reading of what is known about the project. Nothing in it is learned, hidden or guessed by the model: the same facts always give the same assessment, and the visitor sees every factor that counted.

## What it is not

It is **not an estimate of hours, effort, duration or price**. The four levels describe how much there is to think about and build, to help the conversation and the plan. The result carries `notAnEstimate: true`; the interface says *"This is a rule-based reading of how big the task is: not an estimate of hours or cost, and not a promise. The studio makes the quote after evaluating the project."*; the quote request labels it *"Complexity (not an estimate)"*. A test fails if any text of the panel contains a price, a currency sign or a guarantee, in any of the three languages.

## The levels

`small` · `medium` · `large` · `complex / custom` (and *not known yet* when there is neither a project type nor a requirement).

The score is the sum of the factors below. **Small** below 6 points, **medium** from 6, **large** from 14, **complex** from 25.

## The factors

Points are added only for what is known; a characteristic nobody answered counts for nothing and is listed as *not known yet*.

| Factor | Points |
| --- | --- |
| Project type | portfolio 0 · business website 1 · other 1 · redesign 2 · API/backend 3 · dashboard 4 · booking 4 · e-commerce 4 · custom product 5 · web application 5 · SaaS 8 |
| Functional areas (distinct categories among the live requirements that are not "future") | ≤2: 0 · ≤4: 1 · ≤6: 2 · ≤9: 4 · more: 6 |
| Number of requirements (live, not "future") | ≤5: 0 · ≤10: 1 · ≤20: 3 · ≤35: 5 · more: 7 |
| Demanding requirements | one point per *high*-complexity requirement (at most 8) plus one per five *medium* ones |
| User roles | single 0 · few 2 · many 5 |
| Data model | simple 0 · moderate 2 · complex 5 |
| Integrations (the larger of the stated number and the integration requirements) | 0: 0 · ≤2: 1 · ≤4: 3 · more: 5 |
| Authentication | none 0 · basic 1 · advanced 3 |
| Admin area | none 0 · basic 1 · full 3 |
| Automation | none 0 · some 1 · extensive 3 |
| Languages | 1: 0 · ≤3: 1 · more: 2 |
| Security and privacy | standard 0 · elevated 2 · regulated 5 |
| Third-party services | 0: 0 · ≤3: 1 · more: 2 |
| Expected load | standard 0 · elevated 2 · high 4 |
| Existing system (a redesign that names what exists now) | 2 |

**Floors.** Two things make a project at least *large* whatever else is small (`security: regulated`, `scalability: high`); a SaaS is at least *medium*. When a floor raised the level, the result says which level the score alone would have given, and the panel says so.

## What the visitor sees

The level, the score, a *"Why this level?"* list with every factor, its points and what it comes from ("User roles and permissions (a few roles): 2 points"), the thresholds, a line naming what is *not known yet*, and the disclaimer. The same list goes into the quote request (the first six factors) and the plan's overview.

## Where the characteristics come from

The seven choices (roles, data model, authentication, admin area, automation, security, scalability) and three counts (integrations, third-party services, languages) are recorded by the assistant (`assessProjectComplexity`, as proposals) or set by the visitor in the **Project** view (selects with a "not known / not yet" option; a visitor's value cannot be overwritten by the assistant). The assessment is recomputed on every read, so it can never disagree with the data.

For a portfolio or a business website the stage that asks for the characteristics is skipped; the assessment is made from the requirements alone.

## Honest limits

The tables are a judgement of the studio's own work, written down so they can be read and changed; they were not calibrated against past projects. They are the simplest honest answer to "how big does this look", and the visitor can see and correct every input.
