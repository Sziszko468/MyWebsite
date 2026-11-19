# Customer analytics

Source: `customers`, `customer_links`, `client_projects`, `conversations`, `quotes`. Permission: `clients:read`. Filter: customer language.

## Figures

| id | kind | type | meaning |
| --- | --- | --- | --- |
| `totalCustomers` | A | state | all customer accounts |
| `activeCustomers` | A | state | accounts whose status is Active now |
| `newCustomers` | A | flow | accounts created in the period (`newCustomersSeries` over time) |
| `customersWithActiveProjects` | A | state | customers with at least one project not completed or cancelled |
| `customersAwaitingResponse` | A | state | customers with at least one open conversation waiting for your reply |
| `customersByCountry` | U | — | `country_not_stored` |
| `customerAcquisitionSource` | U | — | `customer_source_not_stored` |

A **new customer is a new account**. An account is created by invitation or registration; it is not the date of a first inquiry (`accounts_not_first_inquiries`).

## Breakdowns

* `customersByLanguage` — the preferred language stored on the account.
* `customersByStatus` — active, invited, disabled.
* `customersByOrigin` — by invitation or by registration. This is **how the account was made, not how the customer found the business**.
* `customerLifecycle` — how many customers reached each step at least once, from real records: has an account → linked to a quote request → has an accepted quotation → has a project → has a completed project → returning.

## Segments: the exact rules

A customer can be in several segments (the counts are independent and are not parts of one whole, so the screen draws them as bars, not a ring). Nothing is inferred about a person; each segment is a rule on stored records.

| Segment | Rule |
| --- | --- |
| `segmentNew` | account created in the period |
| `segmentActiveProject` | at least one project that is not completed or cancelled |
| `segmentCompletedProject` | at least one project with the status Completed |
| `segmentReturning` | at least two projects, **or** at least two different accepted quote requests (`returning_rule`) |
| `segmentOpenInquiry` | a linked quote request that is New, Under review, Waiting for the customer or in quotation |
| `segmentAwaitingAction` | an open conversation whose last customer-visible message is from the customer |

The rule is written next to every segment on the screen, in the screen's language.

## What is not here, and why

No country, no acquisition channel for customers (the only channel stored is the *quote request* `source`, shown as "where requests came from"), no satisfaction, no lifetime value (no payments), no attribute that would describe a person's character, health, finances or other sensitive traits. `no_inference_about_people` is stated on the screen.
