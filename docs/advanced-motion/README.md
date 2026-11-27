# Advanced motion and visual experiences

PROMPT 38. Branch `feature/advanced-motion-visuals`, based on `feature/archive-data-integrity` (`46ba3d8`). Nothing is merged or deployed, and nothing was verified in production.
Documents: [ARCHITECTURE](ARCHITECTURE.md) · [ACCESSIBILITY](ACCESSIBILITY.md) · [PERFORMANCE](PERFORMANCE.md) · [TEST_RESULTS](TEST_RESULTS.md) · [LAUNCH_CHECKLIST](LAUNCH_CHECKLIST.md).

## What was done

The website already had one motion system. It was extended, not replaced: **no animation library, no new page, no dependency, no backend change, no change to any Lab experience**.

**Fixed (found by the audit, present on the base branch):**

1. The whole page blinked away and back on the first keystroke or language switch after a direct load.
2. A language switch after a direct load rebuilt the page and scrolled to the top.
3. A page opened by its address in a used tab landed at the previous page's scroll position.
4. A reload or the browser's Back ended part way down a long page.

**Added:**

* **Navigation:** the header's marker answers a click at once; a slowly loading page leaves the current one dimmed but usable; a page's first screen arrives in order.
* **Controls:** one press and lift vocabulary (tokens and mixins) on buttons, cards, choices, tabs and the language switcher, with the same cues for the keyboard; a gliding language marker.
* **Depth:** the first screen's light field falls behind the words as it leaves; featured pictures drift in the Command Center; section stripes draw in.
* **Efficiency:** the home hero, the Lab stage and the Lab previews stop drawing while the phone menu or the phone assistant covers the page.
* **Reduced motion** is followed while the page is open, not only when it starts.

## Where things are

| Area | Files |
| --- | --- |
| Shared pieces | `src/motion/{reducedMotion,indicator,navigation,cover}.ts`, `scroll.ts`, `scrollRestoration.ts`, `ScrollManager.tsx`, `PageTransition.tsx` |
| Tokens and mixins | `src/styles/{tokens.css,_mixins.scss,motion.css}`, `src/motion/config.ts` |
| Components | `MainNav`, `LanguageSwitcher`, `MobileMenu`, `AssistantPanel`, `PageHero`, `SectionHeading`, `Button`, `ProjectCard`, `CategoryCard`, `Gallery`, `Choice`, `Tiers`, `LabControls`, `LabStage`, `useHeroDriver`, `useCanvasLoop`, `CursorLabel`, the Command Center |
| Tests and tools | `src/motion/advanced.test.ts`, `tools/e2e/motion-journey.cjs`, `tools/audit/motion-perf.cjs` |

## Commands

```powershell
npx vitest run src/motion
npx tsc -b ; npx oxlint ; npm run i18n
npm run build ; npm run check:seo
# Browser (AUDIT_PLAYWRIGHT: see tools/audit/README.md)
node tools/e2e/motion-journey.cjs dist
node tools/audit/motion-perf.cjs dist --base <dist of the base commit>
```

## Limits

* Headless Chrome on one Windows machine only: no physical device, Safari, Firefox or screen reader; the GPU was not measured.
* The new effects are deliberately small; their look was checked in screenshots, not judged with users.
* The scroll position of a very slow page is restored only as far as the page reaches after 120 frames (about two seconds at 60 Hz, less on faster screens; [ARCHITECTURE](ARCHITECTURE.md) §8).
* The header's pending marker is for the desktop bar; the phone menu closes at once and the loading bar speaks for it.
