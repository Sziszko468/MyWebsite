# Launch checklist

Nothing here has been deployed, merged or run against the production database. The branch is `feature/business-intelligence`; it adds **no migration** and changes **no environment variable or setting**, so it can be deployed and rolled back like any code-only change.

## Decide (the owner)

- [ ] **Set the business time zone.** Analytics count days in the consultations' zone (Booking settings → time zone). Until one is set the dashboard uses **UTC**, and the screen says so ("Business time zone: UTC"). Set it before relying on "today", "this month" or the overdue counts.
- [ ] **Read the definitions** ([DATA_DICTIONARY.md](DATA_DICTIONARY.md), [METRIC_DEFINITIONS.md](METRIC_DEFINITIONS.md)) and confirm they say what you mean. In particular: *accepted value* is contract value, not cash; *new customer* is a new account; *returning* means two projects or two accepted requests; *delayed* means the expected date has passed.
- [ ] **Decide about revenue.** No payment is recorded, so there is no revenue, cash or receivable figure — by design. If you want one, payments must first be *recorded* (a separate piece of work); the dashboard will not infer them.
- [ ] **Decide about customer country / acquisition source**, which are not stored (so those figures are "not available").
- [ ] **The project status filter (PROMPT 32.1).** Read [FILTER_SEMANTICS.md](FILTER_SEMANTICS.md) and confirm it says what you mean: the filter is the project's **current** status; figures that count **events of the period** (projects or tasks completed, average duration) are **not** filtered by today's status; figures defined for **active** projects are *unavailable* (not zero) when you select Completed or Cancelled.
- [ ] **The Hungarian and Dutch wording changed** in PROMPT 32.1 ([LOCALIZATION_AUDIT.md](LOCALIZATION_AUDIT.md), 14 findings): for example *Szünetel* / *Gepauzeerd* for a project that is on hold (the platform's own words), *Ajánlat állapota*, "kohorsz" replaced by plain words. Read the dashboard once in each language.
- [ ] **Four website texts are blank on purpose** in all three languages (a help line of the FULL EXPERIENCE configurator, the explanation of one comparison row, the tax sentence of a quotation whose tax mode is not specified). Nothing is missing; if you *want* words there, that is your content decision.
- [ ] **Whether the privacy notice needs a sentence** about internal reporting (see [PRIVACY.md](PRIVACY.md)). Nothing is collected from visitors for analytics.

## Check (after deploying to a safe environment, with real data)

- [ ] Open `/admin/analytics` as the **administrator** and as an **editor**: the editor has no *AI usage and cost* tab; every other tab loads.
- [ ] **Compare three figures with the lists they link to** (the *Open the records* links): open quotations, waiting for your reply, active projects. The counts must agree.
- [ ] Compare **accepted value** for a small period with the accepted quotations you know; check both currencies appear on their own lines and are never added.
- [ ] Check the **period line** (dates, days, comparison period, time zone, computed time) for *Last 30 days* and *This month*.
- [ ] **Download a CSV** and open it in your spreadsheet: accents are right, the first lines explain the report, money is in minor units (cents / forints).
- [ ] **Print the overview** on your printer or to PDF: black on white, header with period and time, no navigation.
- [ ] Switch the screen to **Hungarian, English and Dutch** and read one section in each.
- [ ] **Select a project status** in *Projects*, *Overview* and *Alerts*: each figure says *Filtered*, *Not filtered* (with the reason) or *Empty by definition*; compare *Active projects* for one status with the project list filtered the same way, and check that *Completed projects* does **not** change.
- [ ] Look at **dark and light** themes and a **phone**.
- [ ] If the AI admin assistant is on: ask "How many quote requests did we get in the last 30 days, and what is the accepted quotation value?" and confirm the figures equal the dashboard's and that it says accepted value is not cash. *This has not been tried with the real model (no paid call was made); only a scripted model and the tools themselves were tested.*

## Known limitations (stated on the screen where they matter)

No revenue, cash or receivables · the project status filter is the **current** status (no status history exists) and the API gives a per-figure filter note only for it (the other filters keep their per-section behaviour, listed on the screen when set but unused) · no open-pipeline history · no numeric requested budget · no customer country or source · no decline-reason breakdown · funnel history only from the start of the event log · average reply time is wall-clock time · communication analytics are the heaviest query (fine at real sizes; see [PERFORMANCE.md](PERFORMANCE.md)) · performance was measured on **synthetic** data on a development machine, not on production · no PDF · the assistant's analytics tools were not exercised with a live model.

## If something is wrong

Nothing is stored, so there is nothing to repair: fix the code and the next request is right. To switch the screen off without a deploy there is no flag (it is read-only); remove the tab by reverting the branch. The assistant's three tools are separate: reverting `tools.ts` returns it to its 31 tools.
