# Data dictionary

PROMPT 32. Written **before** the code, from the schema and the modules as they exist on `feature/ai-admin-assistant` (`c64cf75`), then checked against the implementation (see "Changes against this plan" in [README.md](README.md)). Every metric below is a **deterministic SQL aggregation** in the backend; no model is involved in any number.

## What the system stores — and what it does not

| Subject | Stored | **Not stored** (so no metric is made up) |
| --- | --- | --- |
| Quote requests | `quote_requests` (`created_at`, `status`, `source`, `kind`, `request_type`, `language`, `archived_at`, `budget_range` **as the customer's own words**), items per service/package/extras | a numeric requested budget; a first-inquiry/acquisition channel beyond `source` (`shop`, `control_room_ai`, `contact_form`, `other`) |
| Quotations | `quotes` (versions; `status` draft/sent/accepted/declined/superseded/withdrawn; `currency` EUR/HUF; `total_minor` etc. as **integer minor units**; `sent_at`, `accepted_at`, `declined_at`, `decline_reason`, `valid_until`, `pricing_mode`) | payment status, invoices, paid dates, outstanding amounts, an exchange rate |
| Quote history | `quote_events` (append-only: `event_type`, `from_status`, `to_status`, `created_at`) | history for requests that predate the event log |
| Customers | `customers` (`created_at`, `status`, `origin`, `language`, `last_sign_in_at`) and `customer_links` to quote requests/bookings | country, acquisition source, satisfaction, anything sensitive |
| Projects | `client_projects` (`status`, `started_on`, `expected_on`, `completed_at`, `created_at`, `quote_request_id`), `client_milestones` (`due_on`, `completed_at`), `project_tasks` (`status`, `due_on`, `completed_at`), `client_project_events` | historical *status snapshots* (only the events that exist) |
| Consultations | `bookings` (`status`, `start_at`, `created_at`, `confirmed_at`, `cancelled_at`, `completed_at`), `booking_events`, `booking_changes` | whether a meeting really took place beyond the `completed` / `no_show` statuses an administrator set |
| Communication | `conversations` (`status`, `resolved_at`, `created_at`), `conversation_messages` (`sender_type`, `visibility`, `message_type`, `created_at`) | message *read* receipts per message for analytics, any private-note content in analytics |
| AI usage | `ai_requests` (`audience` visitor/admin, `status`, tokens, `actual_cost_usd`, `reserved_cost_usd`, `cost_source`, `cost_state`, `latency_ms`, `error_code`), `ai_tool_calls` | invoices; the provider's real bill |

**Consequences (stated again where they matter):** there is **no recorded revenue and no receivable** in this system — accepted quotation value is *contracted/accepted value*, never cash; a historical open-pipeline curve **cannot** be reconstructed (a quotation's `sent_at` and its final `accepted_at`/`declined_at` exist, but not "what was open on day D" for withdrawn/superseded intermediate versions) so none is drawn; snapshot metrics ("active projects now") have **no previous-period comparison**; a requested budget is text, so it is **unavailable** as a number.

## Business time zone and period boundaries

The business zone is the one the owner set for consultations (`bookings` settings `timeZone`, default of that module), the same zone `todayKey()` already uses for "overdue" in project management; UTC if none is set. A **period** is a half-open interval of local calendar days `[from 00:00, to+1 day 00:00)` converted to UTC instants (the conversion uses the zone's offset *at that local midnight*, so daylight-saving days of 23/25 hours are handled). Timestamp columns are compared as ISO-8601 UTC strings; date-only columns (`due_on`, `started_on`, `expected_on`) are compared as local calendar days. The **previous equivalent period** is: for a calendar preset (this month, previous month, this year, previous year) the previous calendar unit; for a rolling or custom range, the same number of days immediately before it.

## Metrics

`A` = actual (stored fact), `D` = derived (rule/arithmetic on stored facts), `E` = estimate, `U` = unavailable. "Flow" metrics are counted in the period and compared with the previous period; "state" metrics are the situation *now* and are never compared.

### Executive overview

| KPI | Kind | Definition | Source · date field · filters | Formula |
| --- | --- | --- | --- | --- |
| New quote requests | A flow | requests received | `quote_requests.created_at` in period; not archived is **not** required | `COUNT(*)` |
| New contact messages | A flow | contact-form inquiries | `inquiries.created_at` | `COUNT(*)` |
| New customers | A flow | customer (portal) accounts created | `customers.created_at` | `COUNT(*)` (an account is created by invitation or registration, not by a first inquiry) |
| Active projects | A state | not completed or cancelled | `client_projects.status` | `COUNT(*)` where status ∉ (`completed`, `cancelled`) |
| Completed projects | A flow | completed in the period | `client_projects.completed_at` | `COUNT(*)` |
| Open quotations | A state | out with the customer | `quotes.status = 'sent'` | `COUNT(*)`; value per currency below |
| Accepted quotations | A flow | accepted in the period | `quotes.accepted_at` | `COUNT(*)` |
| Accepted quotation value | A flow | **accepted contract value, not cash** | `quotes.total_minor` of quotations accepted in the period, `pricing_mode <> 'custom'` | `SUM(total_minor)` **per currency**, integers |
| Potential pipeline value | A state | value of quotations currently open | `quotes.total_minor`, `status = 'sent'`, `pricing_mode <> 'custom'` | `SUM(total_minor)` per currency |
| Recorded revenue | **U** | — | no payment data exists | shown as *unavailable*, never 0 |
| Average quotation value | D | mean of quotations **sent** in the period that were not superseded or withdrawn | `quotes.sent_at`, `total_minor` | `round(SUM/COUNT)` per currency, integer minor units |
| Customer response backlog | A state | open conversations whose last customer-visible message is from the customer | `conversations`, `conversation_messages` (customer-visible, text, not deleted) | `COUNT(*)` |
| Overdue milestones / projects | A state | milestone `due_on` passed in an active project and not completed; project `expected_on` passed and not completed | `client_milestones.due_on`, `client_projects.expected_on`, local today | `COUNT(*)` |

### Financial

| Metric | Kind | Definition |
| --- | --- | --- |
| Requested budget | **U** (numeric) | `budget_range` is the customer's own words; only *the number of requests that state a budget* is given (`A`), never an amount |
| Quoted value | A flow | `SUM(total_minor)` of quotations sent in the period and still standing (status `sent`, `accepted`, `declined`), per currency |
| Accepted quotation value | A flow | as above |
| Open quotation pipeline | A state | as above; quotations in `custom` pricing mode (a price described in words) are **counted but carry no value** and are reported as such |
| Declined quotation value | A flow | `SUM(total_minor)` of quotations declined in the period (`declined_at`) |
| Recorded revenue · receivables | **U** | no source |
| Value over time | A | accepted value per **business-local month** (or day for short ranges) from `accepted_at`, per currency; **open pipeline over time is not shown** (no snapshots) |
| Currency breakdown | A | one row per currency; **EUR and HUF are never added** (no verified exchange rate or date exists) |
| Service / package interest | A | `quote_request_items` joined to `services` / `packages` / extras for requests created in the period: counts of **requests that asked for** each (not sales) |

### Customers

Total accounts, by `status`, by `language`; new in period; **active** = `status = 'active'`; customers with an active project; customers awaiting a response (a conversation waiting for the administrator); **returning** = rule: more than one project, or more than one accepted quotation, linked to the customer. Segments (exact rules in the screen and in [CUSTOMER_ANALYTICS.md](CUSTOMER_ANALYTICS.md)): *new* (account created in the period), *active project*, *completed project*, *returning*, *open inquiry* (a linked quote request in an open status), *awaiting action* (a conversation waiting for the administrator or a customer action due). Country: **U**. Acquisition source: **U** for customers (only the *quote request* `source` is stored, shown as "request channel").

### Conversion funnel (cohort of requests received in the period)

| Stage | A request is counted when… | Timestamp used for time-in-stage |
| --- | --- | --- |
| 1 Received | it was created in the period | `quote_requests.created_at` |
| 2 Reviewed | a `quote_events` row moved it out of `new` | first such event `created_at` |
| 3 Quotation prepared | at least one `quotes` row exists | `quotes.created_at` (first) |
| 4 Quotation sent | a quote has `sent_at` | `sent_at` (first) |
| 5 Quotation accepted | a quote has `accepted_at` | `accepted_at` |
| 6 Project created | a `client_projects` row has `quote_request_id` = the request | `client_projects.created_at` |
| 7 Project completed | that project has `completed_at` | `completed_at` |

Conversion between stages = *requests reaching stage n ÷ requests reaching stage n−1*, within the same cohort; a young cohort has not had time to progress, which the screen says. **Current-state distribution** (a snapshot of `quote_requests.status`) is shown separately and is never used to compute a historical conversion. Decline reasons: only the **count of declined quotations with an explicit `decline_reason`**; the text (customer-written) is not shown in analytics.

### Projects, consultations, communication, AI

See [PROJECT_ANALYTICS.md](PROJECT_ANALYTICS.md), [COMMUNICATION_ANALYTICS.md](COMMUNICATION_ANALYTICS.md) and [AI_USAGE_ANALYTICS.md](AI_USAGE_ANALYTICS.md) for the per-metric tables; the sources are: `client_projects`, `client_milestones`, `project_tasks`, `project_customer_actions`, `deliverable_approvals`; `bookings`, `booking_events`, `booking_changes`; `conversations`, `conversation_messages` (customer-visible only); `ai_requests`, `ai_tool_calls` (`audience` kept apart, combined total for cost control).

## Currency handling

`quotes.currency` is `EUR` or `HUF`; money is **integer minor units** (cents; forints). Totals are `SUM` of integers in SQLite (exact 64-bit) and are returned as integers in minor units **per currency**. No two currencies are ever added; there is no conversion. The browser only formats (`Intl.NumberFormat` with the currency's own minor-unit exponent: EUR 2, HUF 0 in `hu-HU`/`en-GB`/`nl-NL`). The AI cost is in **USD** (the provider's pricing), a separate unit.
