# Launch checklist

Part of the [Command Center and Digital Archive](README.md). **Nothing here is done by this branch**: no merge, no deployment, no production change. Everything below is open.

## 1. Before this code can reach production

- [ ] **Integrate the branches.** This branch is the top of a chain of unmerged feature branches (by local refs on 2026-11-25: 37 commits ahead of `origin/main`, 27 ahead of
  `origin/deployment/render-cloudflare`, which has 3 commits of its own that this chain lacks). The chain contains database migrations up to `0019`; **this branch adds no migration and changes
  nothing under `server/`**. The integration and migration questions are those of the production readiness audit and of the earlier launch checklists; they were not re-examined here.
- [ ] **Review the wording** in Hungarian and Dutch (`src/content/archive/text.ts`, `meta.ts`, the footer's two words): checked by the automatic language checks, **not read by a native speaker**.
- [ ] **Decide the names.** "Command Center" / "Irányítóközpont" / "Commandocentrum" and "Digital Archive" / "Digitális archívum" / "Digitaal archief" are proposals.
- [ ] **Decide indexing.** Both pages are indexable. To keep them out of search results, set `indexable: false` for the two entries of `SYSTEM_PAGES` in `src/routes/pages.ts`.
- [ ] **Decide the categories** of the published projects in the CMS: the archive shows them as they are.

## 2. Build and configuration

- [ ] Build with the production `VITE_SITE_URL` (without it every page is `noindex` and there is no sitemap, as on the whole site) and `VITE_API_URL` (without it the archive shows the content
  built into the website instead of what is published in the CMS).
- [ ] `npm run build` then `npm run check:seo`; the six new addresses (`/{hu,en,nl}/command-center/`, `/{hu,en,nl}/archive/`) are in the built sitemap. The backend's live sitemap rewrites only
  project and consultation entries and passes these through (read in `server/src/modules/system/sitemap.ts`, **not run against a deployed server**).
- [ ] No new environment variable, secret, service, dependency or migration.

## 3. After deploying (nothing of this was done)

- [ ] Open both pages in all three languages on the real domain; follow the footer's links; reload a prerendered address and a direct link (`/en/archive/#entry-demo-bookinghub`).
- [ ] Check that the entries equal what is published: the counts depend on the CMS (today's **14** is the website's own content), a draft or unpublished project must not appear, and a demo that is
  switched **off** in the CMS must not be listed (the demos of PROMPT 35 are off until an administrator enables them in production).
- [ ] Open `/en/archive/?preview=1` while signed in as an administrator: the archive must look the same as for a visitor.
- [ ] Check on a real iPhone and Android phone, in Safari and Firefox, and with at least one screen reader.
- [ ] Submit the sitemap in the search console, if the owner uses one.

## 4. Rolling back

The change is front-end only. Removing it means deploying the previous build; no data is touched. (The usual caveat of the chain applies to going back **past** a migration; this branch has none.)

## 5. Known limitations to accept or schedule

- No publication dates, so no date sorting and no timeline.
- One category and one status per entry; categories limited to what exists.
- The prerendered pages hold the head and the no-JavaScript note, not the list, like every page of this website.
- Search is a plain substring search in the browser (no ranking, no typo tolerance); comfortable for tens of entries, not for thousands.
- Measurements are from one development machine in headless Chrome ([PERFORMANCE](PERFORMANCE.md)).
