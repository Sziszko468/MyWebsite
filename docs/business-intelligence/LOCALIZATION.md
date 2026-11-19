# Localization

The analytics screen is complete in **Hungarian, English and Dutch**.

## Which language

The administration speaks Hungarian or English. The analytics screen has its own language select (like the AI admin assistant's), with the three languages; it starts as the administration's language and the choice is remembered in the browser (`localStorage`, key `cc-admin-analytics-language`; never the only copy of anything). The language is also sent as `lang` so the catalogue names in the service/package breakdowns come back in it. The navigation entry ("Business analytics" / "Üzleti analitika") is part of the administration's own two dictionaries.

There is **no silent fallback to Hungarian**: the dictionaries are typed to have exactly the same keys, a test compares them, and the screen renders in the language asked for.

## What is translated

538 strings per language (520 at PROMPT 32, 18 added by PROMPT 32.1; the audit is in [LOCALIZATION_AUDIT.md](LOCALIZATION_AUDIT.md)): the title and lead; each section's name and lead; the filters and presets; the period/comparison/time-zone lines; the export and print words; the loading, empty, failed and not-permitted states; the names of the three kinds of number and the explanations of the comparison; **a name and a one-sentence definition for every metric, sum of money, series, breakdown and table the server can send** (≈ 55 metrics, 6 sums, 12 series, 20 breakdowns, 7 tables, with their columns); **every limitation** (33), **every reason a figure is unavailable** (9); every status the figures are broken down by; the exact rule of each customer segment; the funnel's stages; every alert kind, reason and suggested step. A code the dictionary does not yet know is shown humanised (`waiting_for_x` → "Waiting for x"), never dropped.

## Numbers, money and dates

All through `Intl`, with the locale of the language: `hu-HU`, `en-GB`, `nl-NL`.

| | en-GB | hu-HU | nl-NL |
| --- | --- | --- | --- |
| euro, 1,234.56 | `€1,234.56` | `1234,56 EUR` (Hungarian groups from five digits) | `€ 1.234,56` |
| forint, 1,500,000 | `HUF 1,500,000` | `1 500 000 Ft` | `HUF 1.500.000` |
| percentage | `12.5%` | `12,5%` | `12,5%` |
| day | `3 Nov 2026` | `2026. nov. 3.` | `3 nov 2026` |

Money keeps its currency's own decimals (euro 2, forint 0). A day or month key is read as UTC so the browser's time zone can never move it by a day. Instants are shown in the **business time zone** (named on the screen), never silently in UTC or the browser's local time.

## Checks

`src/admin/analytics/analytics.test.ts`: identical keys and placeholders in three languages; no empty or unfinished text; no long sentence left identical to English; a word for everything the server can send (read from the server's source, so a new metric without words fails the test); format examples per language; every section renders in all three languages without a raw key, "undefined" or open placeholder. `src/i18n/quality` (the platform's localization rules) passes with the analytics code in the scan (a date helper that used `en-US` was moved to the site's own tag). The browser audit renders every section in all three languages at five widths in both themes.
