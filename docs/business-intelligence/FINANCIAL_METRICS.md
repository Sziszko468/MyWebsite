# Financial metrics

Five different things are called "money" in a business. This system keeps them apart, and so does the dashboard.

| Word | What it is here | Stored? | Where it shows |
| --- | --- | --- | --- |
| **Requested budget** | what a customer wrote about their budget, in their own words | as text (`quote_requests.budget_range`) | only *how many requests state one* (`requestsStatingABudget`); the amount is `unavailable` (`stored_as_text`) |
| **Quoted value** | total of the quotations **sent** in the period that still stand (status sent, accepted or declined; not superseded, not withdrawn) | yes (`quotes.total_minor`, `sent_at`) | `quotedValue` |
| **Accepted quotation value** | total of the quotations the customer **accepted** in the period — accepted *contract* value | yes (`accepted_at`) | `acceptedQuotationValue`, `acceptedValueSeries` |
| **Open pipeline** | total of the quotations that are out with customers **now** (status `sent`) — potential value | yes, now only | `potentialPipelineValue` |
| **Revenue / cash / receivables** | money actually received or owed | **no — no payment, invoice or receivable is recorded anywhere** | `recordedRevenue`, `recordedRevenueMoney`, `outstandingReceivables`: `unavailable` (`no_payment_data`) |

> Never present an accepted quotation as collected cash. Never present a quotation as revenue. Never assume an accepted quotation has been paid.

The dashboard, the CSV, the printed report and the assistant all follow this. The notes "accepted value is not cash" and "no payments are recorded" are part of every financial view.

## Currency

* `quotes.currency` is `EUR` or `HUF`. Amounts are **integer minor units** (euro cents; forints are kept whole). SQLite sums integers exactly; the server sends integers and no floating-point total ever exists.
* **No two currencies are ever added, converted or compared**: no verified exchange rate (nor a date for one) is stored, and none is invented. Every money metric is a list of lines, one per currency, in a fixed order (EUR, HUF). The screen says so under every money card, and the CSV says so in its header.
* The currency filter restricts to one currency; it does not convert.
* The browser only places the decimal point of one currency (`formatMoney`) and formats it with the language's rules (`€1,234.56`, `1234,56 EUR`, `€ 1.234,56`, `1 500 000 Ft`). A source test forbids adding, averaging or converting money in the front end.
* AI cost is in **US dollars**, the ledger's unit, and is an estimate; it is never converted or mixed with the quotation currencies.

## Quotations priced in words

A quotation whose `pricing_mode` is `custom` carries no amount. It is **counted** (`count`) and **not valued**: each money card says "n of m quotations carry an amount" and "k without an amount (price described in words)". Averages leave such quotations out.

## Averages

`averageQuotationValue` = `round(sum of amounts ÷ number of quotations with an amount)` over the quotations sent in the period that stand, per currency, in whole minor units; compared with the previous period's average where it exists. It is a *derived* figure and says so.

## Time

* Flows (`quoted`, `accepted`, `declined`) are counted by the time of the event (`sent_at`, `accepted_at`, `declined_at`) inside the period — **a quotation accepted a few days after the last day of the period is not in it**.
* The open pipeline is a snapshot. It is **not** drawn over time and has no previous-period value, because no history of it is stored and it cannot be reconstructed from current statuses (a withdrawn or superseded version leaves no trace of what was open on a given day).
* Accepted value over time is drawn per business-local day (up to 62 days) or month, **one chart per currency** — two currencies are never on one axis.

## Interest is not purchase

Services, packages, add-ons and FULL EXPERIENCE show *requests that asked for them* in the period. The "accepted" count beside a service or package is the number of those requests whose quotation was accepted. It is interest and outcome of requests, not sales or revenue.

## Limitation codes shown with the financial views

`no_payment_data`, `no_pipeline_history`, `currencies_not_summed`, `budget_stored_as_text`, `custom_pricing_has_no_amount`, `accepted_value_is_not_cash`.
