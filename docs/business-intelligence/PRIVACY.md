# Privacy

The analytics are **aggregates over data the owner already holds**. They add no collection, no tracking, no cookie and no third party.

## What goes where

| Data | Reaches | Contains |
| --- | --- | --- |
| The analytics API answer | the signed-in administrator's browser only | counts, sums per currency, rates, dates, public references of records (alerts), codes |
| The CSV | the administrator's disk | the same, with the period, filters, time and the codes |
| The printed report | the administrator's printer or PDF | the same |
| The assistant's tool results | the model (Anthropic, Haiku 5.5 — the same provider and lock as PROMPT 31) | the **compact** form: metrics, money per currency, breakdown tops, funnel stages, limitation codes — no names, no addresses, no texts, no series |
| The audit log | the administration | `analytics.export`: who, which report, which period. Never the data |
| The browser's `localStorage` | the administrator's browser | one key: the language chosen for the screen |

## What is never read or shown

* **Private and internal notes**, in any section (conversation notes, booking notes, project notes).
* **Message text** — only who sent a message and when.
* **Customer names, e-mail addresses, phone numbers, companies** — not in any analytics answer, CSV or assistant result. (The customer area's own pages show them to the people entitled to see them; analytics link to those pages by public reference.)
* **Decline reasons** (free text), **requested budgets** (free text): only counts of how many exist.
* **Assistant prompts and answers**: the usage ledger holds counts, tokens and costs only.
* **Keys, secrets, session data.**
* **Anything about a person's character, finances, health or other sensitive traits.** Segments are exact rules on stored records; the screen states that nothing is inferred.

## Retention and minimisation

Analytics store nothing: there is no analytics table, cache or snapshot, so there is nothing to retain, expire or delete. The data behind them keeps the retention the source modules already define (conversations, bookings, the AI ledger, …); deleting a record there removes it from the next computation.

## For a privacy notice

The analytics are internal processing of existing records for running the business. They do not change what the public privacy notice says about visitors: nothing is collected from visitors for analytics, no tracking pixel, no analytics cookie, no external analytics provider. (This is the factual state of the code; whether the notice needs a sentence about internal reporting is the owner's call, and no legal basis or retention period is invented here.)
