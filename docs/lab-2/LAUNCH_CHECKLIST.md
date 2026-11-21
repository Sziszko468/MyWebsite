# Lab 2.0: launch checklist

Branch `feature/lab-2-creative-universe` (base `4761c8e`). **Nothing is merged, pushed to a protected branch or deployed.** The code needs no new environment variable, no migration,
no dependency and no change to the server, the Worker or the CSP, so "launching" is merging the branch and deploying the front end as usual. What is left is confirming on real
devices what a development machine cannot show.

## Before merging (the owner's decisions)

- [ ] **Merge order.** This branch sits on top of the PROMPT 33 line (`feature/controlled-ai-automation`, migration 0019 on the server). The Lab changes are front-end only and touch none of
      the server; if the Lab should ship *without* the AI-automation work, rebase these commits onto the branch that is actually deployed (they only touch `src/components/lab/**`,
      `src/content/lab*.ts`, `tools/**`, `docs/lab-2/**`, and two key names ("Home", "Esc") in the spell checker's allow-list `src/i18n/quality/allowedWords.ts`).
- [ ] **The four additions to an experience's controls are a product decision**, not only a technical one: Particle Universe's arrangement (0–99), Chromatic Distortion's mode, Infinite Space's drag-to-look,
      Generative Objects' typed seed. Keep, rename or drop any of them (each is one self-contained change; the tests name them).
- [ ] **Wording.** The new Hungarian and Dutch strings (full screen, how to use it, the input tags, the modes, the seed help, the recentre button) passed the platform's rules and spell checker
      but not a native proofreader. List: `content/labText.ts` (`fullscreen`, `help`, `details.keyboard`), `page/pageText.ts` (`discovery.inputs*`), `experiments/*/…Controls.ts`
      (`arrangement`, `mode*`, `recentre`, `steer`, `seed*`).

## Before promoting the Lab (what was NOT tested, and why it matters)

- [ ] **A real iPhone (Safari).** The full-screen *fallback* (the frame laid over the viewport) is what an iPhone will get, because Safari on iPhone has no Fullscreen API for an element. It was
      exercised here only by removing the API in Chrome. Check: the button, the frame covering the screen under the dynamic toolbar (`100dvh`), Escape being unavailable (the visible Exit
      button is the way out), the page behind not scrolling.
- [ ] **A real Android phone (Chrome) and a mid-range one.** Phone "emulation" in the measurements is a slowed CPU and a small screen; it is not a phone's GPU. Check the tier the Lab picks, that
      Infinite Space's drag does not fight the browser's own gestures, and the frame rate of Particle Universe and Liquid Matter.
- [ ] **Safari (macOS) and Firefox.** Not run. WebGL 2 shaders, `compileAsync`, `:fullscreen` and `scrollbar-gutter` are the places to look.
- [ ] **A screen reader** (NVDA or VoiceOver) through one experience: the stage's name, the panel, "how to use it", the full-screen announcement, the Calm notice.
- [ ] **Hover / pointer devices that are not a mouse** (a stylus, a trackpad with a large gesture surface).

## After merging

- [ ] Run `node tools/e2e/lab2-journey.cjs` (development server) and `node tools/audit/audit-lab2.cjs` (production build) once on the merged result.
- [ ] Re-measure with `node tools/audit/lab2-perf.cjs` on the machine the owner cares about, and compare with [PERFORMANCE](PERFORMANCE.md).
- [ ] The hidden NFSU2 egg: typed `n f s u 2` on `/lab`, it must offer one new-tab link and no frame (the journey checks it; nfsu2.xyz's own framing policy was last read on 2026-11-05 and may change).
- [ ] Analytics: `lab_experience_opened` is unchanged; no event was added for full screen or the new controls. Decide whether any is wanted (and, if so, whether it needs a line in the privacy notice).

## Remaining work (found, measured, not fixed)

- **The heap over a long session** was measured for eight rounds of "open every experience, come back" and its growth per round fell from 1.0 MB to about 0.1 MB ([PERFORMANCE](PERFORMANCE.md) §5).
  An earlier version of this checklist and of PERFORMANCE listed a "slow leak"; that was a measurement artifact (element handles kept by the test), corrected in PROMPT 35. A longer run on a real device is still worth one look.
- **Generative Objects keeps one texture in three.js' own counter after it unmounts** (stable under use; the lost context frees it). Its source was not identified.
- **A flaky timing test outside the Lab**: `server/test/analyticsPerformance.test.ts` fails in full-suite runs on this shared development machine (a 1.5 s ceiling, 2.5 s measured under load) and passes alone (12 of 12, 15 s). Nothing in this branch touches the server.

## Not part of this task, noted

- Generative Objects' "Another version" still draws its seed with `Math.random()` (an explicit visitor action; the seed is now shown, so any version can be got back). It is not an AI and never was.
- The Lab's `?lab=` development switches and `window.__labGl` / `window.__labView` exist only in the development build (`import.meta.env.DEV`); the production bundle has none.
