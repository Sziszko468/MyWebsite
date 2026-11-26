# Architecture

Part of the [Command Center and Digital Archive](README.md). Everything below is in the repository on `feature/command-center-digital-archive`.

## 1. The shape

```
 existing public sources                         src/archive/                          pages (lazy chunks)
 ───────────────────────                         ────────────                          ───────────────────
 projects/store  useProjectList(false) ─┐
 projects/store  useProjectDetails      ├─▶ useArchive ─▶ model.buildEntries ─▶ ArchivePage        (toolbar, rail, ledger)
 content/lab     experiments            │               model.filter / sort      CommandCenterPage  (map, bands)
 demos/ids, content/demos/entry         │               model.facetsOf           SystemBar, EntryRow, EntryVisual, KindRail
 content/playground                    ─┘
 content/services, shop/paths ────────────────────────────────────────────────▶ CommandCenterPage
```

* **`model.ts`** is pure: the entry type, the builder, the query (read from and written to an address), text normalization, filtering, sorting, facets, anchors. No React.
* **`useArchive.ts`** is the only place that reads stores: it assembles the sources in the page's language and returns entries, facets, labels and a `loading` flag.
* The two pages are `lazyRoute` chunks; the main bundle knows only the route entries, the head's two small strings (`content/archive/meta.ts`) and the footer's two words.

## 2. Data flow and timing

* The public project **list** (`/api/projects`, or the static content with no backend) arrives first. The Lab, the tool and the services need nothing and are there at once; while the
  projects arrive the pages say *"Loading the projects…"* and the Command Center's counts that depend on them show `…`.
* A project can have a **demo** only if its slug is eligible (`demoTypesFor`) and it has a page; for those (at most the three registered slugs) the hook reads the project's **public
  detail** — the same endpoint and cache as the project's own page — and `parseProjectDemo` decides, after the checks of [DATA_INTEGRITY](DATA_INTEGRITY.md) §3. The pages never ask for a preview.
* A list an administrator loaded earlier in the same visit through `?preview=1` (it holds drafts) is **ignored** and the public list is requested.

## 3. The archive's search: state, not address

The search, filters and sort are the **page's own state**; the address only mirrors it:

* A keystroke or a choice updates the state at once and **replaces** the address (never pushes: Back leaves the archive).
* An address that comes from elsewhere (Back, a link, a reload, a direct link) is adopted. The page marks the addresses it writes itself (`history state {own: true}`) and does not re-adopt them.
* Why: the first version bound the inputs to the address. The router applies a new address in a React transition, so the controls flickered back to the old value and **lost keystrokes**;
  a real browser showed it ("clicking the radio did not change its state", a search that did not filter). Unit tests that render once cannot see this.
* Unknown or malformed values in an address are ignored (`readQuery`); a category or status that no entry has is dropped once the data is there (`effectiveQuery`).

## 4. Direct links

`#entry-<kind>-<slug>` (`anchorFromHash` accepts only that shape and only for an entry that exists). The page: clears a search that would hide the entry (during render, so it is never drawn without it)
and removes it from the address, scrolls the entry into view, moves focus to the row (`tabIndex={-1}`, once per link) and marks it (a red rule and a sentence). A row's *Direct link* is an
ordinary `<a href="#…">`.

## 5. Motion and looks

* Rows that appear after a search arrive with a short fade and rise (`--dur-base`, compositor only, only under `prefers-reduced-motion: no-preference`); rows that stay are not replayed
  (React keeps them). Command Center bands arrive once (`Reveal`); sectors and tiles lift a little on hover (`--motion-intensity`, zero under reduced motion); a soft light follows the
  pointer over the map (`usePointerField`: mouse and pen only, off under reduced motion). Nothing loops, nothing uses WebGL (the Lab's art is a still SVG).
* The pages take the site's theme (they set none). The Command Center runs in the Lab's motion scope, the archive in the portfolio's.

## 6. SEO

`SYSTEM_PAGES` are indexable in all languages. The head: a title and description per page and language; canonical and hreflang from the generic pipeline (the path only, so no query or
anchor is a second page); structured data `CollectionPage` with a breadcrumb *Home › Command Center › Digital Archive*. Both are prerendered and in the sitemap
(the build writes 121 pages; the check says 122 files, 91 indexable, 31 noindex).

## 7. Decisions not to undo

1. **No second source of truth.** An archive entry is a view of a record that lives elsewhere.
2. **Public only**, never the preview; a source-scan test fails on any private import or admin endpoint.
3. **No invented fields**: no dates, no metrics (a test checks the entry's keys).
4. **State, not address** for the controls (§3).
5. **The header's navigation does not change**; the footer carries the two links.
6. **Counts are computed**, never written into the words.

## 8. Adding to it

* **A new project** published in the CMS appears by itself (with its demo, if switched on and registered).
* **A new kind of entry**: add it to `ARCHIVE_KINDS`, build it in `buildEntries` from its own registry, give it labels in `text.ts` and a picture in `EntryVisual`, and extend the tests.
* **Dates**: add the field to the CMS and the public card, then a `date` sort and, if wanted, a timeline.
