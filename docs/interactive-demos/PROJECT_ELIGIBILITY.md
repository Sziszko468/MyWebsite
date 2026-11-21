# Project eligibility

Part of [Interactive project demos](README.md). Which of the portfolio's projects got a demo, which did not, and why. The rule from the brief: a demo is
built only from capabilities the project's own repository documents; a project without enough verified functionality keeps its existing presentation.

## The test every project had to pass

1. **It exists**: the project is in the catalogue (`src/content/projects.ts`) and has a details page (`detailPath !== null`).
2. **There is something real to reproduce**: a repository (on this machine, under `ProjectWork/`) whose README or docs describe a concrete, interactive workflow.
3. **That workflow can be shown honestly on invented data inside this page**, with no backend, key, payment, e-mail or login, and the demo can say plainly what it adds
   or leaves out compared with the project.
4. **Nothing needs inventing about the project itself**: no customer, metric, testimonial or "live" claim.

## Result

| Project | In the catalogue | Details page | Repository reviewed | Demo | Format |
| --- | --- | --- | --- | --- | --- |
| **Spendly** (README titled WALLEX) | yes, status *demo* | `/work/spendly` | `Spendly/` | **yes** | Web-app workflow (`finance-workbench`) |
| **BookingHub** | yes, status *demo* | `/work/bookinghub` | `Bookingsite/booking-app` | **yes** | Booking flow (`booking-flow`) |
| **Logistics Platform** | yes, status *demo* | `/work/logistics-platform` | `Logextic/` | **yes** | Web-app workflow / board (`shipment-board`) |
| **Hollandia Kezdőknek** | yes, status *concept* | **none** (`detailPath: null`) | none found | **no** | n/a |

### Why each format

* **Spendly → a finance workbench.** Its README documents transaction create/delete with search, filters, sorting and pagination, ten default categories, and **monthly
  budgets with spent / remaining / usage, a warning from 80 % and an over-budget state**. Those are interactive rules a visitor can feel in thirty seconds: add an expense and
  watch a bar cross 80 %. (Its real principle is that the backend is the source of truth and clients never compute totals; the demo computes in the browser and **says so**.)
* **BookingHub → a booking flow.** The repository's public booking form (name, e-mail, service, date, time, required-field and e-mail checks, a summary) and its appointment
  list with status changes are what the demo reproduces. **The real BookingHub has no availability or conflict check**, so the demo's free/taken times are an *added
  illustration*, labelled as such, not a claim about the product. Its e-mail confirmation (Resend) is *not* simulated as sent: the demo says no e-mail is sent.
* **Logistics Platform → a shipment board.** Its docs define the workflow `NEW → ASSIGNED → LOADING → IN_TRANSIT → DELIVERED` (or `CANCELLED`), reasons for cancelling and
  stepping back, role-dependent permissions, and rule-checked assignment of a driver and a truck (papers valid on the delivery day, no overlapping open shipment, nothing in the
  workshop). That is a state machine with rules, which a demo can show exactly. The trailer, the map route and live updates are left out and said to be.

### Why the others have no demo

* **Hollandia Kezdőknek**: no repository was found (`Pictures/Hollandia` holds unrelated personal photos), the catalogue marks it `concept`, it has no tags and **no details page**.
  A demo would have to invent the product. Its existing presentation is unchanged. *Owner input that would change this*: the repository or a written description of what the
  guide does, and a details page for it.
* **Formats the brief lists but no project backs** (a data dashboard, a frontend-creative demo): the portfolio has no project whose documented capability is one of these, so no
  such demo was built. The Lab (PROMPT 34) already is the site's frontend-creative showcase and is not a "project demo".

## What the registry enforces

`DEMO_PROJECTS` in `src/demos/ids.ts` (mirrored in the backend and the admin) maps each type to the slugs it suits:

```
finance-workbench → spendly
booking-flow      → bookinghub
shipment-board    → logistics-platform
```

A demo can be switched on only for those pairs. A booking demo on a logistics project would present one project's behaviour as another's, so the website ignores it
(`parseProjectDemo` → `null`) and the backend refuses to store it (`content.demo.type: invalid`); both are tested.

## Evidence and its limits

* The "real" lists shown on each demo page were written from the repositories' own READMEs and docs (for example the Spendly README's budget section, the Logextic
  `docs/architecture.md` state diagram and README workflow line, the BookingHub README's feature list). The repositories were read on this machine; **they were not run for this task**, and the
  demos' behaviour was not compared against a running instance of the originals.
* The sample data (names, amounts, dates, shipments) is invented for the demos. No row was copied from a project's database, seed or screenshots.
* The projects' README/code disagreements recorded earlier (BookingHub's README overstates its security and framework version; Spendly was renamed) are **not** repeated in the
  demos: the demos reproduce only behaviour that the code or the documentation shows.
* If a project's repository changes (a new feature, a removed rule), its demo's `real` / `simulated` lists in `src/content/demos/shell.ts` must be re-read against it.

## Adding a project later

A new project is eligible only when it passes the four tests above. Then: add the slug to `DEMO_PROJECTS` for an existing type, or add a type
([ARCHITECTURE §8](ARCHITECTURE.md)); write the `real` and `simulated` lists from its repository; add its details-file `demo` field and the seed.
