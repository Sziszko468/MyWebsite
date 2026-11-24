# Launch checklist

Part of the [Design System Playground](README.md). Nothing here has been done in production: the branch is not merged, not deployed, and no production setting was changed.
Tick a box only after doing the step on the real site.

## A. Decisions that belong to the owner

- [ ] **Read the playground's words in Hungarian and Dutch** (`src/content/playground/text.ts`, `entry.ts`, `meta.ts`). They pass the localization checks (completeness, spelling with
      Hunspell, no hard-coded sentences, the glossary, the forbidden-word rules), but no person has read them for tone, and some Dutch compounds were rephrased into dictionary words
      to pass the spelling check (for example *Laboratorium voor kleur* instead of *Kleurenlab*).
- [ ] **The name.** "Design System Playground" is kept in English in all three languages, as the Lab's experiences keep their names. Say if it should be translated.
- [ ] **Whether the page is indexed.** It is: `index, follow`, in the sitemap with its three language alternates (the Lab's experiments are the same). Make it `noindex` in
      `src/routes/pages.ts` (`PLAYGROUND_PAGES`, the `indexable` argument) if you want the tool reachable but not listed.
- [ ] **Where it is linked from.** Only the band on the Lab's overview, by design (the brief: a tool *within the LAB ecosystem*, not an experiment). The footer and the header do not link to it.
- [ ] **What "original" means.** The playground treats the five brand tokens of `tokens.css` as the original palette. If the brand colours change there, the playground follows (a test
      reads them); the semantic roles of a *changed* palette are derived by the playground, not read from the site (see [ARCHITECTURE](ARCHITECTURE.md) §4).

## B. Before merging

- [ ] Review the diff of `feature/design-system-playground` (base `23e5904`, the demos branch). It changes the route table, the app's route list, the head, the breadcrumb builder, the
      Lab's motion scope and the Lab page, and adds the playground; it changes no backend file, no migration, no dependency and no security setting.
- [ ] CI: `npx tsc -b`, `npx oxlint`, `npx vitest run`, `npm run i18n`, `npm run build`, `npm run check:seo` (results on this branch in [TEST_RESULTS](TEST_RESULTS.md); run them again on the merge result).
- [ ] `src/i18n/quality/allowedWords.ts` gained the words *design, system, playground, archivo, monospace, monospace-stack, easing, labra*; check they belong there.

## C. Production prerequisites

- [ ] The three new pages (`/hu|en|nl/lab/design-system/`) are **static, prerendered files** in `dist` (like every page); confirm the host serves them and that the edge Worker does not
      rewrite `/lab/design-system` (the production edge was not tested here).
- [ ] The Content-Security-Policy and the headers are **unchanged**. The playground sets styles through React's `style` attribute (as many existing components do) and runs no inline
      script, no `eval` and no request, and the audit on the production build, served with its real policy, saw no console error. **Not checked on the real host.**
- [ ] Nothing to enable in the administration, no environment variable, no database change: the playground has no backend.
- [ ] The sitemap on the real site is the **live** one (the backend builds it from the published pages): confirm it lists the new URLs, or that the static one is still used there.

## D. After deploying: verify on the real site

- [ ] The Lab's overview shows the band after the six experiences and still **six** experiences; the band's button opens the playground; the playground's links lead back to the Lab.
- [ ] In each language: the page opens, the five laboratories answer, an invalid HEX says why, copy works (it needs a secure page), reset restores, nothing is stored (dev tools → Application),
      no request is made while playing (dev tools → Network), and the site's own theme and colours never change.
- [ ] `<meta name="robots">` and canonical, the three `hreflang` alternates and the breadcrumb of the page.
- [ ] Real devices: an iPhone and an Android phone (the sliders, the pickers, the sticky bar, 320–390 px), a tablet, Firefox and Safari on a desktop, the keyboard only, a screen reader
      (NVDA / VoiceOver), the operating system's *reduce motion* setting, forced-colours mode. **None of these was done.**
- [ ] Real timings (Lighthouse or the CDN's real response): the figures in [PERFORMANCE](PERFORMANCE.md) are from a headless Chrome on a development machine.

## E. Rollback

Revert the merge. There is no migration and nothing stored; the three pages disappear with the build, and the Lab's band with them. To hide only the page, set `indexable` to `false` and
remove `PLAYGROUND_PAGES` from `PAGES` (a one-line change); to hide only the link, remove `<DesignToolBand />` from `src/pages/LabPage.tsx`.

## F. Known issues and follow-ups

See [TEST_RESULTS](TEST_RESULTS.md) §7 for what testing found and what became of it, and these that are **not fixed here**:

* The **contrast report is derived**: for the original palette its ratios can differ slightly from the live site's hand-tuned tokens. It says so on the page.
* The component laboratory leaves out `Section`, `PageHero`, the mobile menu, the header's dropdown, the language switcher and the theme toggle (reasons in [COMPONENTS](COMPONENTS.md)).
* Only three typefaces (the brand's, the system's, a monospace stack). No serif, because the project has none.
* No state is kept across a reload and none can be shared by a link. A "share my settings" feature would need a URL format and a decision about indexing; it was not built.
* The pre-existing site issues recorded in [`docs/interactive-demos/LAUNCH_CHECKLIST.md`](../interactive-demos/LAUNCH_CHECKLIST.md) (the sticky header over the Dutch footer's first link at 320 px
  when a page is scrolled to its very bottom) are the site's header and footer, not the playground's, and were not touched.
