# Availability and time zones

The server decides what can be booked. The page asks for a range of days and is told what is free; a booking request names one start instant and the server works the answer out again inside the transaction that writes it. Nothing is calculated only in the browser, and nothing about who booked what is sent: a free slot is a start and an end.

Code: `server/src/modules/bookings/zone.ts` (time zones), `availability.ts` (the engine). Tests: `server/test/bookingAvailability.test.ts` (29, no database) and `server/test/booking*.test.ts` (through the API).

## What the owner writes

| Setting | Meaning |
| --- | --- |
| **time zone** | the IANA zone the hours are in (`Europe/Budapest`). **No default**: booking cannot open without one. Checked with `Intl`; stored with every booking |
| **weekly hours** | windows of the **local day**: weekday (Mon = 1 … Sun = 7), from, to (`to` may be `24:00`; a window never crosses midnight). Several per day; overlapping ones are merged. Optionally for one consultation type |
| **exceptions** | `closed`: a day, a period (first and last day) or part of one day (times, one day only). `open`: a one-off window on one day, outside the weekly hours. A private label |
| **start times every N minutes** (5–240) | the grid inside a window: a window from 09:00 with 30 gives 09:00, 09:30, 10:00… (this is the brief's "slot duration"; the consultation's **length** is a property of the type) |
| **buffer** (0–240 min) | free time kept before and after every booking |
| **shortest notice** (0–720 h) | a slot that starts sooner than this from now is not offered |
| **how far ahead** (1–365 days) | the last day that can be booked, counted from **today in the owner's zone** |

There are **no default hours and no default zone**. The numbers in the right-hand column are starting values shown for review; booking is closed until the owner has saved the settings, chosen a zone, switched a type on, written hours and turned the switch on (`closedReasons` lists what is missing).

**Per-type hours.** A type that has rules of its own is offered **only** in those; a type without uses the general ones (rules with no type). That is how one type can be limited to Fridays. Exceptions apply to every type.

## How one day is worked out

For a local date `D` and a type:

1. **Windows.** The type's own weekly rules (or, if it has none, the general ones) for `D`'s weekday, plus any `open` exception that covers `D`, are turned into intervals of **instants** (see below) and merged.
2. **Closures** covering `D` are cut out: a whole-day closure removes the day; a part-day closure removes its interval. **A closure always wins over an opening.**
3. **Slots.** In each window, slots start at the window's start and then every N minutes; a slot of the type's length must **end inside its window** (a 45-minute type in a 09:00–11:00 window with a 30-minute grid has 09:00, 09:30, 10:00; 10:30 would end at 11:15).
4. **Notice and horizon.** A slot starting before `now + notice` is dropped; days before today and after `today + horizon` are closed.
5. **Taken time.** A slot is dropped when it comes within the buffer of a **live booking** (`pending`, `confirmed`, `reschedule_requested`, `rescheduled`) or of a slot **held** for an open reschedule/proposal. A cancelled, completed or no-show booking holds nothing.

The day is then `available` (it has a free slot), `full` (it had slots after step 4 and all are taken: "fully booked") or `closed` (no hours, closure, past, beyond the horizon, or everything inside the notice).

When a booking is moved (a customer's request, an owner's proposal), the engine runs with **that booking left out of the blocking set**, so its own time is not in its own way; a request for its own current time is refused (422).

An owner's proposal may only be one of the times the rules offer. To propose an evening, add a one-off opening first.

## Time zones and daylight saving time

Three kinds of value are never mixed:

* an **instant** (a point on the UTC time line): what a booking *is*. Stored as ISO text with `Z`; shown only through `Intl` with the owner's `timeZone`;
* a **date key** `YYYY-MM-DD`: a calendar day with no time and no zone (what a calendar cell and a weekly rule mean). Moving between keys is calendar arithmetic (`addDays`), so a 23 or 25 hour day is still one day;
* a **local minute** (0–1440): what the owner means by "09:30".

A date and a local minute become an instant only through the zone (`resolveLocal`), and that function never picks silently:

| The wall-clock time… | Result | Used as |
| --- | --- | --- |
| exists once | `valid` | the instant |
| **does not exist** (clocks go forward, e.g. 02:30 on 29 March 2026/28 March 2027 in Budapest) | `gap`, with the instant of the jump | a window **edge** in a gap is read as the moment of the jump; an owner-typed one-off time in a gap is **refused** (`nonexistentTime`) |
| **exists twice** (clocks go back, e.g. 02:30 on 25 October 2026) | `ambiguous`, both instants | a window **edge** is read as its first occurrence; an owner-typed one-off time is **refused** (`ambiguousTime`) |

Slots are generated on **elapsed time** from the window's start instant, so the engine needs no special case for a short or long day:

* the day the clocks go **forward** (Budapest, 28 March 2027): hours 00:00–06:00 give five slots, 00:00, 01:00, **03:00**, 04:00, 05:00: the local times **02:xx never exist and are never offered**;
* the day the clocks go **back** (31 October 2027): hours 00:00–05:00 give six slots, and the repeated **02:00 appears twice** (the first in summer time, the second in winter time). Both are real, and both are marked `ambiguous`; the page then shows the zone's short name beside them (`02:00 CEST`, `02:00 CET`) so the two can be told apart;
* "09:00" is the same wall-clock hour on both sides of a change and a different instant (`08:00Z` before, `07:00Z` after): the tests assert it.

The visitor's browser time zone is **not consulted anywhere**: the page formats every instant with `timeZone: <the owner's zone>` and names the zone ("Times are shown in this time zone: Europe/Budapest, Central European Standard Time. If you are somewhere else, the time on your own clock may differ."). A booking request is an instant with an explicit `Z` or offset; a time without a zone (`2026-11-04T09:00:00`) is refused because its meaning would depend on the machine that reads it. A time written with an offset is accepted as the instant it is, and must still be exactly one of the free slots.

E-mails use the same formatting (date, time range, and `Europe/Budapest (CET)` naming the zone and the abbreviation in force at that moment) and, for a move, the event's own snapshot of the new time.

## Validation

* A zone must be one the platform knows (`Intl`); a date must be a real calendar date (`2026-02-30` is refused); a window needs `from < to`; partial-day times belong to one day; an `open` exception needs times and one day; at most 100 windows and 300 exceptions per save.
* The list is checked **as a whole and replaced in one transaction**: one mistake changes nothing, and each error names its row and field (`hours.1.end`, `exceptions.0.start`).
* A range request for days is at most 62 days; a booking needs a type that is switched on, has a length, and has its name and description in the booking's language.

## Limits and honest notes

* The horizon is counted in days from today in the owner's zone; the notice in hours from the server's clock. If the server's clock is wrong, so is availability.
* Weekly rules are validated for shape, not against a specific date's gap/overlap (a rule has no date). Avoid hours that start or end between 02:00 and 03:00 on a change night; the engine's reading (above) is documented, not surprising, but may not be what the owner meant.
* The same visitor may hold up to **three** live bookings (against one person taking every slot); other limits are in [SECURITY.md](SECURITY.md).
* The tests exercise Budapest and New York changes in 2026 and 2027; the zone data is the platform's (Node's ICU). A zone whose rules changed after the Node release in use will follow Node's data, not the news.
