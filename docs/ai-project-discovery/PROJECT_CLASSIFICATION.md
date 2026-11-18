# Project classification

The project type is stored as **structured data**, not as text in the conversation: `ai_discovery.project_type` (checked by the database against the list below), with `type_origin` (`visitor` or `assistant`) and `type_confirmed`.

## The eleven types

| Identifier | Shown as (EN) | Typical meaning |
| --- | --- | --- |
| `portfolio` | Portfolio / personal website | a person or a small business showing work |
| `business_site` | Business website | services, contact, content |
| `ecommerce` | E-commerce | products, checkout, orders |
| `booking` | Booking / reservation platform | clients book classes, tables, resources |
| `web_app` | Web application | workflows, accounts, data |
| `saas` | SaaS platform | accounts, teams, subscriptions |
| `dashboard` | Dashboard / admin system | data, roles, reports |
| `api_backend` | API / backend development | a service others call |
| `redesign` | Website redesign | rebuilding something that exists |
| `custom_product` | Custom digital product | a new idea that fits nowhere else |
| `other` | Other / not sure | **always an acceptable answer** |

The labels exist in Hungarian, English and Dutch (`discoveryLabels.types`); the identifier is never translated.

## Who writes it, and what "confirmed" means

- The **assistant** classifies through `classifyProjectType`. Its choice is stored as `origin: assistant`, `confirmed: false` and is shown as *"proposed by the assistant: confirm it or choose another"*.
- The **visitor** chooses a type with the radio buttons (any of the eleven, including "Other / not sure"), or presses **Confirm** on the proposal. Their choice is stored as `origin: visitor`, `confirmed: true`.
- Once the visitor has chosen or confirmed a type, **the assistant cannot change it**: the tool returns `{ applied: false, refused: [{ key: 'type', reason: 'confirmed_by_visitor' }] }` and a note telling the model to respect it. (Verified in the browser journey: the assistant's attempt to switch a confirmed *booking* to *saas* leaves *booking* in place.)
- If the assistant proposes again while its own proposal is still unconfirmed, the proposal is replaced; the visitor's confirmation is what freezes it.

## What the type changes

| Where | Effect |
| --- | --- |
| Stages | `portfolio` and `business_site` skip the `complexity` stage (their assessment is made from the requirements) |
| Topics | the guidance the model gets lists the topics that matter for that type |
| Complexity | the type is the first factor (0 to 8 points; see [COMPLEXITY_ASSESSMENT.md](COMPLEXITY_ASSESSMENT.md)); a `saas` is at least *medium* |
| Plan | the architecture proposals, the phases (a `redesign` adds content migration) and the risks (a `redesign` adds migration) are chosen from the type and the requirements |
| Quote request | the type is the "Classification" row of the brief |

## "Other / not sure"

`other` is a complete answer. It does not block a plan (the requirements and the facts carry the plan), it adds a small base to the complexity (1 point), and the plan lists the open frontend and backend choices as *not known yet* instead of guessing. The assistant is told to use it when the idea is not clear rather than to force a category.
