# Information architecture

PROMPT 37. Written before the implementation, after reading the application, and kept in step with it. Part of the [Command Center and Digital Archive](README.md).

## 1. What the site already has (the sources)

| Source in the repository | What it holds | Public? |
| --- | --- | --- |
| `src/projects/` (`useProjectList`, public `/api/projects`, static fallback in `content/projects.ts` + `content/projectDetails/`) | The portfolio: name, label, description, category (with trilingual labels), status (`live`/`demo`/`in-progress`/`concept`), tags, a cover (screenshot or generated concept sketch), a details page, which languages it exists in. Statically: Spendly, BookingHub, Logistics Platform, Hollandia Kezdőknek. | Yes: only **published** projects. The administrator's preview (`?preview=1`) shows drafts and is **never** used by the new pages. |
| `src/content/lab.ts` (`experiments`) | The six official Lab experiences: number, name, tagline, status, inputs, tech. | Yes |
| `src/demos/` (`DEMO_TYPES`, `DEMO_PROJECTS`, `demoEntry`) | Interactive demos of three projects; which are enabled comes from each project's public detail (`detail.demo`). | Yes (the demo pages are `noindex`) |
| `/lab/design-system` (`content/playground`) | The Design System Playground: a design tool in the Lab. | Yes |
| `src/content/services/`, `packages.ts`, shop routes | Four services, four packages, the full-experience configurator and the shop. | Yes (offerings, not "work") |
| About, Contact, Consultation, Control Room, Privacy | Pages. | Yes |
| Admin (`src/admin`), client portal, quotations, bookings, analytics, business intelligence, project management | Private or customer data. | **No: not read, not linked as content** |

## 2. What goes where

**Command Center** (`/{lang}/command-center`): the way in. A single composed page that shows what exists and leads to it:

1. **Entry**: the name, what it is, the system bar (Command Center · Archive · Work · Lab).
2. **The map**: the destinations as a spatial index of seven sectors with their real counts — the archive, the projects, the demos, the six Lab experiences, the design tool, the services, and About and Contact.
3. **Featured work**: the published projects marked featured (or the first four), with their real cover.
4. **The Lab**: the six official experiences, numbered, each with its own still artwork.
5. **Demos**: the interactive demos that are switched on.
6. **Services and the shop**: the four services and the shop's entry points.
7. **People**: About and Contact.

**Digital Archive** (`/{lang}/archive`): everything above that is *work*, as one searchable list. Services, About and Contact are not "work" and are not entries.

## 3. Archive entries

| Kind | One entry per | Title | Description | Category | Status | Link |
| --- | --- | --- | --- | --- | --- | --- |
| **Project** | published project available in the language | its name | its card description | the project's own category (from the CMS list) | its status | its details page (none → the entry says so) |
| **Interactive demo** | published project whose public detail has a demo switched on | project + demo name | the demo's summary | the project's category | the project's status | the demo page; also the project |
| **Lab experience** | each of the six experiences | its name | its tagline | *Creative coding* | its Lab status | its page |
| **Design tool** | the Design System Playground | its name | its description | *Design tools* | ready | its page |

Static content today: **4 projects, 3 demos, 6 experiences, 1 tool = 14 entries** (a CMS with other published projects changes the numbers; the page computes them).

### Categories

Only categories that real content supports. The project categories are the three the CMS already has (*Web and mobile apps*, *Platforms and systems*, *Concepts and guides*); the two others are *Creative coding*
(the six experiences, which are real-time WebGL work) and *Design tools* (the playground). A category appears only if it has an entry.

Not used, and why: *Web development*, *Web applications* would be a second name for what the CMS categories already say; *Interactive experiences* is a **kind** here (demos and experiences are
filterable by kind), not a category; *Experiments* would need content that says it is an experiment (the Lab experiences are called *experiences*); *Digital products* has no content (the shop sells
services, not products).

### Status

The statuses that appear in the entries: *Live*, *Demo*, *In progress*, *Concept* (projects and their demos) and *Ready* (experiences and the tool). A status is offered as a filter only if an entry has it.

### Dates

**No dates and no timeline.** The static content has no creation or publication date; the CMS's `publishedAt` says when a row was published (or seeded) in this database, not when the work was
made, and the project details' `reviewed` is the date their facts were checked. Showing any of these as "created" or "published" would be wrong, so the archive shows none and offers no date sort. If the owner
adds a real "year" or "date" field to the CMS, a date sort and a timeline can be built on it.

## 4. Finding things

* **Search**: words (all must match), over title, description, tags, category, kind and status, in the page's language, ignoring accents and case. Local: no request, no external service.
* **Filters**: kind, category, status (one each). **Sort**: *curated* (the site's own order: projects, demos, experiences, tool), name A–Z, name Z–A, kind. **Clear all** resets search, filters and sort.
* **The address** holds the state (`?q=&kind=&category=&status=&sort=`), replaced (not pushed) as the visitor types, so a filtered view can be shared and Back leaves the archive. Unknown values are
  ignored. The canonical address is always `/{lang}/archive` without a query, so no filtered view is a second page for a search engine.
* **Direct links**: every entry has a stable anchor, `/{lang}/archive#entry-<kind>-<slug>`; opening one shows that entry (filters are cleared if they would hide it), scrolls to it, moves focus to it and marks it.

## 5. Navigation

* A **system bar** on the Command Center and the Archive: *Command Center · Archive · Work · Lab*, the current one marked.
* The **footer** of every page links to the Command Center and the Archive (beside the six main pages, which are unchanged: the header navigation does not change).
* The Command Center links to everything in §2; every entry of the archive links to the existing page that already tells its story.

## 6. Search engines

Both pages are indexable: they hold real, public content in all three languages (never empty: the website's own content is there without a backend). No new indexable URL is created for an entry, a filter or a
search. Nothing private is read, so nothing private can be indexed.

## 7. Deliberately excluded

* Anything from the administration, the client portal, quotations, bookings, analytics or project management.
* The hidden NFSU2 racing screen (it is hidden on purpose and is none of the six experiences).
* The Control Room assistant, consultation and privacy pages as archive entries (they are site features, not work).
* Services and packages as archive entries (offerings; the Command Center links to them).
* Dates, a timeline, view counts, popularity, ratings, "related" suggestions: no real data supports them.
* A second database, a new API, an external search service.
