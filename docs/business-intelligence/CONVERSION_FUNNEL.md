# Conversion funnel

Source: `quote_requests`, `quote_events`, `quotes`, `client_projects`. Permission: `requests:read`. Filters: customer language, service, package.

## A cohort, not a count of events

The funnel follows **the requests received in the period** and counts how many reached each stage, wherever the stage happened in time. That is a cohort. It is different from "how many quotations were sent this month", which is an event count and is a different (financial) figure. The screen says which it is.

| # | Stage | A request is counted when… | Time between stages |
| --- | --- | --- | --- |
| 1 | Received | it was created in the period | — |
| 2 | Reviewed | a recorded status change moved it out of *New* | average days after stage 1 |
| 3 | Quotation prepared | at least one quotation exists for it | after stage 2 |
| 4 | Quotation sent | a quotation has `sent_at` | after stage 3 |
| 5 | Quotation accepted | a quotation has `accepted_at` | after stage 4 |
| 6 | Project created | a project exists with this request as its origin | after stage 5 |
| 7 | Project completed | that project has `completed_at` | after stage 6 |

Each stage shows its count, its conversion from the previous stage, its conversion from all received, and the average days from the previous stage. A conversion is `requests reaching stage n ÷ requests reaching stage n−1`; it is empty (no percentage) when the previous stage has none.

## What the funnel is not

* **Not built from today's statuses.** Statuses now are shown separately as snapshots (`cohortCurrentStatus` for this cohort, `allRequestsCurrentStatus` for all requests) and are never used to compute a conversion (`status_snapshot_not_a_funnel`).
* **Immature cohorts look bad.** Requests from last week have not had time to reach later stages; the screen says so (`cohort_not_matured`).
* **History starts with the event log.** A request that predates the event log has no stage times (`events_only_since_event_log`).
* **No decline reasons.** Reasons are free text written by the customer; only `declinedWithRecordedReason` (how many declined quotations carry a reason) is counted, not the text (`decline_reason_text_not_shown`). No breakdown by reason is possible and none is invented.

## Other figures of the section

`requestsAwaitingReview` (New or Under review, now), `openQuotations`, `acceptedQuotations`, `declinedQuotations`, `declinedWithRecordedReason`.
