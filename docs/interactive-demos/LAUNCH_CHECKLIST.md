# Launch checklist

Part of [Interactive project demos](README.md). Nothing here has been done in production: the branch is not merged, not deployed, and no production setting was changed.
Tick a box only after doing the step on the real site.

## A. Decisions that belong to the owner

- [ ] **Read the three demos' "real vs simulated" accounts** (`src/content/demos/shell.ts`, shown on every demo page in hu / en / nl) against the three repositories. They were written from the
      repositories' README and docs; the repositories were read, **not run**, and the demos were not compared with a running copy. Correct any line that is not true.
- [ ] **Language review by a native speaker** (hu, nl; en too). The words pass the localization checks (completeness, spelling with Hunspell, no hard-coded sentences, forbidden-word rules) but
      no person has read them for tone.
- [ ] **The public name**: the Spendly repository's own README is titled WALLEX; the demo, like the rest of the site, says Spendly (existing open item from the project pages).
- [ ] **Hollandia Kezdőknek**: no demo, because there is no repository and no details page. Supply the repository or a description if a demo is wanted ([PROJECT_ELIGIBILITY](PROJECT_ELIGIBILITY.md)).
- [ ] **Whether the three projects' status stays *demo*** (it is, and the demos do not change it): nothing in the demos says a project is live.

## B. Before merging

- [ ] Review the diff of `feature/interactive-project-demos` (base `bf83a7d`, the Lab 2.0 branch). This branch contains the PROMPT 35 work only, plus a **correction to the PROMPT 34
      documents** (see D1).
- [ ] CI: `npx tsc -b`, `npx oxlint`, `npx vitest run`, `npm run i18n`, `npm run build`, `npm run check:seo` (results on this branch in [TEST_RESULTS](TEST_RESULTS.md); run them again on the merge result).
- [ ] The migration count did not change (no migration was added; the demo setting lives in `content_json`), so the *"older code refuses to start after a newer migration"* rule from earlier prompts is not triggered by this branch.

## C. Production prerequisites (this is what stops the demos appearing)

- [ ] **Existing production databases have no `demo` setting**, and the projects seed only fills an *empty* projects table, so **re-seeding changes nothing**. After deploying, an administrator
      must, for each of the three projects: *Admin → Projects → (the project) → Links → Interactive demo → switch on, pick the type → Save (and publish as for any project change)*.
      Until then the project pages show no entry and the demo routes answer *"This project has no demo"*. (A fresh database seeded from this branch has the three demos on.)
- [ ] Deploy order is not critical by reading the code: a new website with an old backend sees no `demo` field and shows no entry; an old website with a new backend ignores the field. **Not tested across versions.**
- [ ] Confirm the **hosting serves the prerendered demo pages** (`/{lang}/work/{slug}/demo/` exist as files in `dist`, 9 pages) and applies the Content-Security-Policy from `_headers`. The demos need no change to the
      policy (no inline script, no external request), and nothing about the hosting was changed or checked here.
- [ ] If an edge rule sends visitors by country or language, check it does not rewrite the demo paths (the production edge was not tested).

## D. After deploying: verify on the real site

- [ ] The entry band on the three project pages (not on Hollandia, which has no page), in hu / en / nl; the button opens the demo.
- [ ] Each demo page: the three labels, Restart, Full screen, the "real vs simulated" account, the back link; **no network request and no storage change while using it** (browser dev tools).
- [ ] `<meta name="robots" content="noindex, follow">` on the demo pages; **no demo URL in `sitemap.xml`**; the project pages still `index, follow` and in the sitemap.
- [ ] Switch a demo off in the admin and confirm the entry disappears and the demo URL shows the "no demo" state; switch it on again.
- [ ] Real devices: an iPhone (Safari, including the full-screen fallback), an Android phone, a tablet; Firefox and Safari on a desktop; keyboard only; a screen reader (NVDA / VoiceOver);
      the operating system's *reduce motion* setting. **None of these was done.**
- [ ] Real timings (Lighthouse / the CDN's real response), because the numbers in [TEST_RESULTS](TEST_RESULTS.md) are from a headless Chrome on a development machine.

## E. Rollback

* Per project, immediately: switch the demo off in the admin (the entry disappears; the demo URL shows the "no demo" state).
* Whole feature: revert the merge. There is no migration and no stored data to undo; the `demo` object stays inside `content_json`, where older code ignores it.

## F. Known issues and follow-ups (not fixed here, outside this task)

* **D1 — PROMPT 34 documentation correction.** While measuring the demos, the Lab 2.0 *heap* figures were found to be a measurement artifact (Playwright's `waitForSelector` keeps the page's
      elements alive, which made every page look like it leaked). The claim was withdrawn and `docs/lab-2/PERFORMANCE.md`, `LAUNCH_CHECKLIST.md`, `TEST_RESULTS.md` and `tools/audit/lab2-perf.cjs`
      were corrected **on this branch only**; the copies on `feature/lab-2-creative-universe` (already pushed) still contain the withdrawn claim until this is merged or cherry-picked.
* **D2 — the sticky header covers the Dutch footer's first link at 320 px** when a page is scrolled to its very bottom (axe `target-size`, *serious*). Found on the base commit and on pages unrelated to
      the demos (`/nl/about/`, `/nl/services/`), so it is the site's header and footer, not the demos.
* **D3 — the project gallery's "Open larger" buttons are 2 px high** (the layout check reports `162×2` buttons on the project pages). Identical on the base commit; the demos did not touch the gallery.
* **D4 — the audit browser keeps the previous page's scroll offset** when a new page is opened in the same tab (`page.goto`). It looks like a headless-Chrome behaviour, was seen on the base commit too and
      was not investigated; `tools/audit/audit-demos.cjs` scrolls each view to the top before measuring.
* **D5 — the demos cover three projects.** Hollandia has none (no repository, no page). A data-dashboard or frontend-creative demo was not built because no project has a verified capability behind it.
* **D6 — one language-switch behaviour to know**: switching the page language inside a demo restarts it (the sample text is resolved into the page language when the state is created).
