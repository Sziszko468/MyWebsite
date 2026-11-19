# Metric definitions

The identifiers the API, the CSV and the screen's dictionary use. `A` actual (stored fact), `D` derived by a rule, `E` estimate, `U` unavailable. **Flow** = counted in the period, compared with the previous equivalent period. **State** = the situation now, never compared. The longer wording of each (in three languages) is in `src/admin/i18n/analytics.ts`; the source tables and formulas are in [DATA_DICTIONARY.md](DATA_DICTIONARY.md).

## Period rules

* Presets: today, yesterday, last 7 / 30 / 90 days, this month, previous month, this year, previous year, custom (at most 1,830 days, from 2000-01-01).
* A rolling preset's previous period is the same number of days immediately before. *This month* / *this year* are compared with the previous month / year **over the same number of elapsed days** (like for like). *Previous month* / *previous year* with the month / year before. A custom range with the same number of days before it.
* Days are local days of the business zone; the period is `[from 00:00, to + 1 day 00:00)` converted to UTC with the zone's offset at that local midnight.
* Daily points for up to 62 days; local calendar months beyond (first and last clipped to the period).

## Overview

| id | kind | type | meaning |
| --- | --- | --- | --- |
| `newQuoteRequests` | A | flow | quote requests received |
| `newContactMessages` | A | flow | contact-form messages received |
| `newCustomers` | A | flow | customer accounts created (invitation or registration) |
| `activeProjects` | A | state | projects not completed or cancelled |
| `completedProjects` | A | flow | projects completed (by `completed_at`) |
| `openQuotations` | A | state | quotations sent and waiting for the customer |
| `acceptedQuotations` | A | flow | quotations accepted (by `accepted_at`) |
| `recordedRevenue` | U | — | `no_payment_data` |
| `customerWaitingForAdministrator` | A | state | open conversations whose last customer-visible message is from the customer |
| `overdueMilestones` | D | state | milestone of an active project, not completed, due before today (business zone) |
| `delayedProjects` | D | state | active project whose expected date is before today |
| money: `acceptedQuotationValue`, `potentialPipelineValue`, `averageQuotationValue` | A · A · D | flow · state · flow | see [FINANCIAL_METRICS.md](FINANCIAL_METRICS.md) |

## Financial

`quotationsSent` · `acceptedQuotations` · `declinedQuotations` (A flow) · `openQuotations` (A state) · `requestsStatingABudget` (A state: requests of the period in which the customer wrote about a budget; counts requests, not money) · `requestedBudgetAmount` (U `stored_as_text`) · `recordedRevenue`, `outstandingReceivables` (U `no_payment_data`). Money: `quotedValue`, `acceptedQuotationValue`, `declinedQuotationValue`, `potentialPipelineValue`, `averageQuotationValue`, `recordedRevenueMoney` (U). Series: `acceptedValueSeries` (one per currency), `quotationsSentSeries`, `quotationsAcceptedSeries`, `quotationsDeclinedSeries`. Breakdowns: `quotationsCreatedByStatus`, `servicesRequested`, `packagesRequested`, `addOnsRequested`, `fullExperienceRequests`, `requestChannels`. Table: `acceptedVersusDeclined`.

## Customers · funnel · projects · consultations · communication · AI · alerts

See the dedicated documents: [CUSTOMER_ANALYTICS.md](CUSTOMER_ANALYTICS.md), [CONVERSION_FUNNEL.md](CONVERSION_FUNNEL.md), [PROJECT_ANALYTICS.md](PROJECT_ANALYTICS.md) (also consultations and alerts), [COMMUNICATION_ANALYTICS.md](COMMUNICATION_ANALYTICS.md), [AI_USAGE_ANALYTICS.md](AI_USAGE_ANALYTICS.md).

## The three kinds of "missing"

| What the screen says | `state` | Meaning |
| --- | --- | --- |
| a value | `available` | the data produced it (possibly 0) |
| "Not available" + a sentence | `unavailable` | the system does not store what is needed, or there is nothing to average in this period (`no_replies_in_period` …). Never drawn as 0 |
| "Not available for your role" | `not_permitted` | the role may not read the data behind it; no value and no reason about the data are sent |
