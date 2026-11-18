# The project plan

`server/src/modules/ai/discovery/planner.ts`. The plan is a **proposal for the conversation and for the studio to start from**. It is made by rules from the discovery draft: generating or regenerating it makes no model call and cannot invent anything. It never contains a price, a delivery date or an estimate of hours, and nothing the visitor has not confirmed is presented as confirmed.

## The six sections

| Section | Content | How it is made |
| --- | --- | --- |
| **Overview** | name, type, objective, problem, audience, existing system, desired launch, budget idea, maintenance, complexity | the facts as the visitor and assistant recorded them, each with its origin and whether it is confirmed |
| **Requirements** | every live requirement under its priority, with status, required/optional, category | rejected requirements are left out; only their *number* is recorded |
| **Recommended architecture** | front end, back end, database, integrations, security, hosting: **proposals, not decisions**, each with the reasons it was proposed | chosen from the type, the requirement categories and the characteristics (see below) |
| **Development phases** | a sequence for *this* project, each phase listing the requirements it covers | discovery and specification, design, technical foundation (when there is a back end or the project is medium or larger), content migration (redesign), core development (the essential requirements), additional functionality (important and optional ones), testing and tuning, deployment, handover and maintenance (when asked for, or medium or larger). **It is a sequence, not a schedule and not a deadline** |
| **Risks and dependencies** | missing information, external dependencies, technical risks, unconfirmed assumptions, decisions the visitor must take | from what is *not* known, skipped, unconfirmed or complex |
| **Next steps** | what to do next | review the suggestions, fill in the gaps, decide the open questions, prepare content, send the request, what the studio does |

## How the architecture is proposed

A few examples of the rules (the whole table is in the code and is covered by tests):

- an `api_backend` has no front end and gets an API service; an `ecommerce` gets a storefront application and a payment integration and a payment security review;
- a content-only site (no accounts, no payments, no admin, no data, no booking) gets mostly static pages, static hosting, no back end and no database; a redesign adds "rebuild the front end";
- accounts, payments, booking or data get an application back end, a relational database (with migrations when the data model is complex, the type is SaaS or there are many roles) and managed hosting;
- each security characteristic adds its item (authentication and roles, sensitive data handling, a separate legal and compliance review for a regulated setting); elevated or high load adds a hosting plan that can grow.

Every item carries its `why` (codes such as *accounts*, *payments*, *data*, *many roles*, *no accounts*), shown to the visitor as *"Why: …"*. The section is headed "(a proposal, not a decision)", and the plan says so again at the top.

## Risks, by kind

- **Missing information:** audience, timeline, budget, maintenance (when neither answered nor skipped), the existing site of a redesign, the characteristics nobody answered.
- **External dependency:** third-party services, a payment provider, delivery of the content (always).
- **Technical risk:** a complex data model, a regulated setting, high load, a migration, many roles, extensive automation.
- **Unconfirmed assumption:** requirements and facts the assistant wrote and the visitor has not confirmed, an unconfirmed type, a budget "is not a promise", a timeline "is not confirmed".
- **Decision needed:** design direction, hosting and operation, who maintains the content after handover (always).

## The visitor's notes

The visitor can write a note on any section. Notes are stored apart from the generated text and travel with every version, so a regenerated section never loses what the visitor wrote. See [PLAN_VERSIONING.md](PLAN_VERSIONING.md).

## Language

The plan is stored as **codes and the visitor's own words** (never translated text), plus the language of the conversation. It is worded in the visitor's current language when displayed, and in the conversation's language when it is projected into the quote request. The visitor's words (project name, objective, requirement titles) are shown exactly as written.

## What the studio receives

The plan is *projected* into the existing quote workflow's `ProjectPlan` (project type, goal, audience, required and optional features with their unconfirmed marks, front end, back end, database, integrations, complexity, timeline, budget idea, overview, the proposals, dependencies, open questions, next steps) together with the **version and hash** of the snapshot it came from, and the full structured plan is added to the request's brief. See [QUOTE_INTEGRATION.md](QUOTE_INTEGRATION.md).
