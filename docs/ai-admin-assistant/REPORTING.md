# Reporting

Seven reports, each made by one tool, each in the same shape. The point of the shape is that **a reader can always tell what the database said from what the assistant thinks**.

| Report (`kind`) | Tool | About |
| --- | --- | --- |
| Project status (`project_status`) | `generateProjectReport` | one project: summary with rule results, risks, pending actions |
| Customer overview (`customer_overview`) | `generateCustomerReport` | one customer: overview and the activity of the last N days (default 30, at most 90) |
| Quote request analysis (`quote_analysis`) | `generateQuoteReport` | one request: summary, what is missing, the state of its quotations |
| Communication summary (`communication_summary`) | `generateConversationReport` | one conversation: counts, unanswered messages, possible questions (a heuristic, labelled) |
| Consultation briefing (`consultation_briefing`) | `generateConsultationReport` | one consultation: details, scheduling conflicts, what is unknown |
| Weekly business overview (`weekly_business_overview`) | `generateBusinessReport` | the last 7 days: overview, activity, alerts (general context only) |
| Administrative action report (`administrative_actions`) | `generateBusinessReport` | what needs action now, by fixed rules (general context only) |

## The shape

```
title (from the kind)        generatedAt        subject (a link)        period        dataSources
confirmedFacts      ← read from the database by the SERVER when the report is generated
aiObservations      ← the model's own words, checked, shown as "AI interpretation: not verified data"
recommendations     ← the model's own words, checked, shown as "AI recommendations: not verified data"
missingInformation  ← codes derived from the stored fields, worded by the screen in the administrator's language
limitations         ← fixed codes: stored_records_only, no_private_notes, no_estimates, ai_interpretation_unverified, human_review_required
notAvailableToYou   ← areas a business report left out because the role may not read them
```

- **The model cannot put a number, a date, a name or a price into `confirmedFacts`.** The tool takes no input for it; the facts are built by the server from the same readers the other tools use. A tool call with an extra `confirmedFacts` field is rejected by the strict schema (tested).
- The model's words are limited to eight observations and eight recommendations of at most 400 characters each, and **an amount of money in them is refused** (`€500`, `500 euro`, `10% off`, `kedvezmény of 15`…): the assistant is told to refer to the quotation's own stored figures instead.
- The screen shows the facts in a block with a **solid green edge** and the heading "Confirmed facts (read from the database)", and the model's words in blocks with a **dashed amber edge** and the headings above: the difference is in words and in the border, not only in colour. The facts are collapsed behind "Show the data" (they are the raw stored fields, with their stored English names).
- Every report ends with "Prepared by an AI assistant. Check it before you rely on it."
- Generating a report is recorded in the audit log (`ai.admin_assistant.report`: who, which kind, which reference) — never its content — and counted in the usage numbers as "reports generated".

## Accuracy rules

No estimate (`estimates: "none"`), no forecast, no invented period. Every count says its period or that it is the state now. A project's *stored status*, *stored task status* and *calculated progress* are different fields and are never merged. Nothing is called complete unless the stored status says so. An empty rule result says "no rule matched". The tests compare report facts with the database (stored status, task counts, quotation totals in minor units, business counts for a stated period against independent `COUNT(*)` queries).

## Export and print

There is no existing export in the administration, so the screen offers three small ones, all made **in the browser** from what is on the screen (nothing is sent anywhere and no file is fetched):

- **Copy report** — plain text, the headings above, to the clipboard.
- **Download as text** — the same text as a `.txt` file named `ai-assistant-summary-YYYY-MM-DD.txt` (no part of the conversation is in the name).
- **Print report** — the report is marked and the page's print style (`styles/admin.css`, `@media print`) prints only it, from the top of the sheet, without the sidebar, the header or the buttons.

The conversation has **Copy summary** and **Export summary** (a `.md` file): who asked what, what the assistant answered, the records used, and the notice.
