# Reporting and exports

Two outputs, both made from **the section the screen shows** (so both follow the same period, the same filters and the same permissions): a CSV file and a printed report. No PDF: the project has no server-side PDF mechanism, and adding one only for this is not justified; the browser's print dialog can save a PDF if the owner wants one.

## CSV

`GET /api/admin/analytics/export?report=<section>&<the screen's period and filters>`, a plain same-origin GET with the session cookie. The screen downloads it as a Blob (so the byte order mark survives).

**Who may**: a signed-in administrator who may read that section. A section the role cannot read answers `403`; nothing is built for it. An unauthenticated request is `401`. The request is rate-limited (the `analytics` limiter), and each export writes an audit event (`analytics.export` with the report and the period — never the data).

**What is in it**

1. Comment lines (each starts with `#`, never a table cell): the report, the **period** (local days and days count), the **business time zone** and the UTC instants (end exclusive), the previous period, **when it was generated (UTC)**, the **filters**, and two statements: money is in whole minor units and is **never added across currencies** (an accepted quotation is contract value, not cash); rows of kind `estimate` are estimates and `unavailable` means "not stored", not zero.
2. Blocks, each with a header row: `[metrics]` (id, kind, state, value, previous period, change, change %, comparison, reason), `[money]` (per currency, minor units, previous period, quotations with an amount, quotations, without amount, reason), `[series]` (bucket key, from, to, value, unit, currency), `[distributions]`, one `[table:<id>]` per table, `[funnel]`, `[alerts]`, and `[limitations]` (the codes).
3. A UTF-8 byte order mark so a spreadsheet reads Hungarian accents; CRLF line ends; the file name `analytics-<report>-<from>_<to>.csv`.

**Safety**: a text that begins with `=`, `+`, `-`, `@`, a tab or a carriage return is prefixed with an apostrophe so a spreadsheet can never run it as a formula (checked *before* line-break normalisation); a cell with a comma, quote, semicolon or line break is quoted. Numbers are written as numbers. Nothing private can be in it: the sections hold no private notes, no message text, no e-mail address, no key. Responses carry `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff`.

CSV codes are the stable identifiers (`newQuoteRequests`, `no_payment_data`) — the screen's words are for people, the codes are for spreadsheets.

## Printed report

The *Print report* button marks the section's container and the page (`data-printable`, `body[data-printing]`) and opens the browser's print dialog; the page's print style (`admin.css`) then shows **only** that container, from the top of the sheet, in black on white, without the navigation and the buttons; the marks are removed when the dialog closes (`afterprint`). The container begins with a print-only header: *Business analytics report*, the section, the **period**, the **comparison period**, the **time zone**, **when it was computed**, and "internal document: not for publication". The report shows the figures, the charts and tables, and **what these figures cannot tell you**; the "what is this?" definitions and the chart tables are left out to keep the sheet short (the CSV has the numbers).

The executive report is the *Overview* section printed; any other section prints the same way.

## What is not offered

Scheduled or e-mailed reports (nothing sends mail from analytics), a public link to a report, a per-customer export, an export of message text or notes.
