# Command Center and Digital Archive

PROMPT 37. Branch `feature/command-center-digital-archive`, based on `feature/design-system-playground` (`9d39cc6`). Nothing here is merged or deployed, and nothing was verified in
production. Documents: [INFORMATION_ARCHITECTURE](INFORMATION_ARCHITECTURE.md) · [ARCHITECTURE](ARCHITECTURE.md) · [ARCHIVE_DATA_MODEL](ARCHIVE_DATA_MODEL.md) ·
[ACCESSIBILITY](ACCESSIBILITY.md) · [PERFORMANCE](PERFORMANCE.md) · [TEST_RESULTS](TEST_RESULTS.md) · [LAUNCH_CHECKLIST](LAUNCH_CHECKLIST.md).
PROMPT 37.1 (branch `feature/archive-data-integrity`) hardened the data rules and the test schedule: [DATA_INTEGRITY](DATA_INTEGRITY.md).

## What was implemented

Two public pages in hu / en / nl, built entirely on the website's existing public data and components:

* **Command Center** (`/{lang}/command-center`), the way into everything: an editorial hero with the real number of entries; **the map** of seven sectors (archive, work, demos, Lab,
  design tool, services, about and contact) with their real counts and a light that follows the pointer; **featured work** as alternating spreads with the project's own picture;
  the **six Lab experiences**, each with its own still artwork; the **interactive demos** that are switched on; **services and the shop**; and **the person behind it**.
* **Digital Archive** (`/{lang}/archive`): **14 entries today** (4 projects, 3 demos, 6 Lab experiences, 1 design tool) as a ledger with numbered rows and a picture each. **Live
  search** (every word, accents and case ignored, names, technologies, categories, kinds, states), a **rail** of kinds with counts, **category** and **status** filters, **sorting** (curated,
  name A–Z, name Z–A, kind), **Clear all**, an empty state with a way out, the count said to screen readers, the search **kept in the address** (replaced, never pushed), and **direct links**
  to every entry (`#entry-…`) that focus and mark it and win over a filter that would hide it.
* A **system bar** on both pages (Command Center · Archive · Work · Lab) and two links in **every page's footer**. The header's six-page navigation is unchanged.
* The two pages are indexable (titles, descriptions, canonical, hreflang, breadcrumbs, prerendered, in the sitemap); a search or filter makes no second page (the canonical address carries no query).

## Reused (nothing parallel was built)

| Existing system | How it is used |
| --- | --- |
| The project registry (`src/projects/`: public list, details, static fallback) | The archive's projects; one small hook (`useProjectDetails`) reads the public details to know which have a demo |
| The Lab's list (`content/lab.ts`), its status words and its still artwork (`LabArt`) | The six experiences |
| The demo registry (`src/demos/ids.ts`, `content/demos/entry.ts`) | Which projects have a demo, its name and sentence |
| The Design System Playground's words | The tool's entry |
| The services, their paths and names (`content/services`, `shop/paths.ts`) | The services band |
| Components: `PageHero`, `Container`, `Button`, `Badge`, `TextField`, `SelectField`, `LocalizedLink`, `Reveal`, `usePointerField`, `ProjectMockup` | The pages |
| The localization engine (`tri()`, `i18n:check` / `validate`), the design tokens, the motion system (scopes, `--dur-*`, reduced motion), the head and SEO pipeline | Everything |

PROMPT 37 made **no backend change** (37.1 later fixed two things in the server, see [DATA_INTEGRITY](DATA_INTEGRITY.md)): no new endpoint, no database, no migration, no new dependency, no external service.

## What is public, and what is deliberately not

Public: published projects (in the languages they exist in), their enabled demos, the six experiences, the design tool, the services, About and Contact. **Never read:** the
administration, the client portal, quotations, bookings, analytics, business intelligence, project management, the assistant's data; the administrator's preview of drafts (`?preview=1`)
is **ignored** by these pages. Details: [ARCHIVE_DATA_MODEL](ARCHIVE_DATA_MODEL.md) §3.

Deliberately excluded (reasons in [INFORMATION_ARCHITECTURE](INFORMATION_ARCHITECTURE.md) §7): dates and a timeline (no real dates exist), view counts or popularity, categories no
content supports, services as archive entries, the hidden NFSU2 screen, a second database or search service.

## Where things are

| Area | Files |
| --- | --- |
| Pages | `src/pages/CommandCenterPage.tsx`, `src/pages/ArchivePage.tsx` (each its own lazy chunk) |
| Model and data | `src/archive/model.ts` (pure), `src/archive/useArchive.ts` |
| Parts | `src/archive/SystemBar.tsx`, `EntryRow.tsx`, `EntryVisual.tsx`, `KindRail.tsx` + styles |
| Words | `src/content/archive/text.ts` (pages), `meta.ts` (head); the footer's two words are in the dictionaries |
| Routing, head, motion | `src/routes/pages.ts` (`SYSTEM_PAGES`), `src/App.tsx`, `src/routes/documentMeta.ts`, `src/seo/jsonLd.ts`, `src/motion/config.ts` |
| Footer | `src/components/SiteFooter/SiteFooter.tsx` |
| Store (one hook added) | `src/projects/store.ts` |
| Tests and tools | `src/archive/archive.test.ts`, `tools/e2e/archive-journey.cjs`, `tools/audit/audit-archive.cjs`, `tools/audit/archive-perf.cjs` |

## Commands

```powershell
npx vitest run src/archive
npx tsc -b ; npx oxlint ; npm run i18n
npm run build ; npm run check:seo
# Browser checks (Playwright and axe-core: see tools/audit/README.md for AUDIT_PLAYWRIGHT / AUDIT_AXE)
node tools/e2e/archive-journey.cjs                                         # 21-step journey against the dev server (npm run dev on :5173)
node tools/audit/audit-archive.cjs dist [--quick]                          # responsive + accessibility matrix on the production build
node tools/audit/archive-perf.cjs dist --base <dist of the base commit>    # load and interaction measurements
node tools/e2e/archive-backend-check.cjs                                    # against a real server and scratch database (build first: see its header)
```

## Limits (honest)

* Verified in headless Chrome and by unit tests only: **not** in Safari, Firefox, on a physical phone, with a screen reader, or in production.
* The archive is **as complete as the public data**: the numbers above are for the website's own content; with a backend, the published projects of the CMS decide them.
* No dates, so no date sort and no timeline; a category list limited to what the content supports.
* Search is a plain substring search of a few hundred words in the browser: no ranking, no typo tolerance.
