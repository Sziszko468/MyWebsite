# Launch checklist

Part of [Advanced motion and visual experiences](README.md). **Nothing here is done**: no merge, no deployment, no production change.

## 1. Before this code can reach production

- [ ] **Integrate the branches.** This branch sits on `feature/archive-data-integrity` and the whole unmerged chain below it, which holds database migrations up to `0019`; see the launch checklist of
  [the Command Center](../command-center/LAUNCH_CHECKLIST.md). This branch changes front-end code only and adds no migration, variable, secret or dependency.
- [ ] Look at the new effects and keep or drop them: the dimming of a page while the next one loads, the first-screen arrival order, the depth in the page heroes, the language marker.
- [ ] Wait for the separate fix of the intermittent e-mail test, or accept that the full suite can fail on it ([TEST_RESULTS](TEST_RESULTS.md)).

## 2. After deploying (nothing of this was done)

- [ ] Open a page by its address, switch the language: the page must stay where it is, without a blink.
- [ ] Scroll one page far down, type another page's address in the same tab: it must open at the top. Reload a long page half way: it must come back there.
- [ ] Throttle the network and click through the header: the marker moves at once, the old page dims, links still work.
- [ ] On a real iPhone and a real Android phone: scrolling smoothness on the home page, the Lab and the Command Center; the phone menu over the hero; taps on cards and the language buttons.
- [ ] Safari and Firefox (the code uses the individual `translate` and `scale` properties, `:has()` and `IntersectionObserver`).
- [ ] With the system's "reduce motion" on, and with a screen reader.

## 3. Rolling back

Front-end only: deploy the previous build. No data is involved.
