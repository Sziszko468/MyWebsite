# Accessibility

Part of the [Design System Playground](README.md). What was decided, what was measured, what was found and fixed, and what was **not** done.

## 1. Decisions

| Area | Decision |
| --- | --- |
| **Structure** | One `h1` (the page), one `h2` per laboratory and for "Good to know", `h3` for the parts inside. Each laboratory is a `<section>` named by its own `h2` (`aria-labelledby`). The bar is a `<nav aria-label="Playground sections">`; the controls and the preview of a laboratory are `role="group"` with a name; each preview stage is a named group. |
| **Native controls** | Sliders are `<input type="range">` with a visible label, a live value in an `<output>` and `aria-valuetext`. Choices are `<fieldset>` + `<legend>` of native radio buttons (arrow keys). Switches are checkboxes with `role="switch"`. Fields are the site's `TextField` / `SelectField` / `CheckboxField` (label tied to the control, hint and error read with it). Buttons are the site's `Button`. The colour picker is the browser's `<input type="color">` with an `aria-label` naming the colour. No `div` or `span` carries a click handler or `role="button"` (a test scans for it). |
| **Names** | A button's visible word starts its accessible name (WCAG 2.5.3): *Copy* is named "Copy the value of Racing Red", *Restore* "Restore Cobalt Blue", *Replay* "Replay: Card entrance". |
| **Not by colour alone** | A changed colour is marked by a bar, a dot **and** the words "Changed here, temporary" (with the original value and a Restore button), the original by "Original brand token". A contrast result is a tick or a cross **and** the words *Pass* / *Fail* per level, and the report says "Roles that do not reach WCAG 2 level AA: N". A wrong HEX is `aria-invalid`, has the site's error icon and a sentence that says *why* (empty, a character that is not a digit, the wrong number of digits) and that the preview keeps the last valid colour. |
| **Announcements** | One visually hidden `role="status"` / `aria-live="polite"` region says: what was copied, that copying failed, that everything or one section was reset, which theme the previews now use, and which example was played again. The same text twice in a row is made new (a zero-width space) so it is read again. |
| **Keyboard** | Everything is reachable and operable by key in the order of the page: Tab through the five section links, the preview-theme radios (arrows), Reset everything, then each laboratory; Space toggles a switch or a radio; arrows move a slider by one step; Enter presses a button. The one scrollable box (the scroll-reveal example) is a labelled region with `tabindex="0"` so it can be scrolled by keyboard. Nothing traps focus: Tab from the last control reaches the footer (the journey does it). |
| **Focus not obscured** | The bar under the header is sticky only from the `md` breakpoint up, and every focusable element in the page has a `scroll-margin` that clears the header and the bar, so a control that takes focus is scrolled into the clear (WCAG 2.2 *Focus Not Obscured*). On a phone the bar is not sticky. |
| **Focus appearance** | The site's global focus ring (token `--color-focus`, 2 px, offset) applies to every control; the journey asserts a visible outline or shadow on a focused link. |
| **Targets** | Buttons are the site's (the small one is a full finger on a touch screen), the colour picker is 44 × 44 px, the radio chips and range inputs are the Lab's, the switches are 44 × 24 px (above the 24 px minimum of WCAG 2.2 *Target Size*). The audit's layout check asks every link, button and field for 24 px; the journey asks buttons and fields for a finger (≈43 px) at 390 and 320 px. |
| **Reflow** | No horizontal page scroll at 320 px (asserted at 320, 390, 768, 1024, 1440, and after play). The wide things scroll *inside* their own box: the section links on a phone, a wide preview (the real navigation bar), the contrast table. |
| **Reduced motion** | The system's `prefers-reduced-motion` and the visitor's own switch both take every duration, distance and stagger out of the motion examples (the stage's custom properties, and the same in CSS). The playground itself has no autoplay and no loop; a "Replay" is the only way an animation starts. The visitor can see what reduced motion leaves, without changing the operating system. |
| **Colour contrast** | All text, borders and focus colours are the site's tokens, whose pairs the site's own tests verify. The preview stages use the same tokens or, for a changed palette, derived ones whose text colours are moved to reach 4.5:1 where the palette allows it. The page does **not** hide that a visitor's palette can be unreadable: it measures it and says so. |
| **Language** | `<html lang>` follows the page language; every label, instruction, error, announcement and sample sentence is in the page's language. Brand colour names, typeface names, token names and component source paths are proper nouns or code and are written as they are. |
| **Previews are not destinations** | A link in a preview does not navigate, so a keyboard or screen-reader visitor is never taken away by pressing Enter on a sample link; the page says so ("Links in the previews do not leave this page"). |

## 2. Measured

* **axe-core 4** with WCAG 2.0 / 2.1 / 2.2 A and AA and best-practice rules (colour contrast included) on the **production build** with its real Content-Security-Policy, for the page in
  hu / en / nl, dark and light, at 1440, 1024, 768, 390 and 320 px: **72 views, 0 findings** (30 pages, each also **after play**: a wrong HEX showing its message, a changed colour, the contrast report open, the light
  preview theme, the monospace typeface, the phone width in the layout laboratory and reduced motion on; 10 views of the Lab's overview with its band; and the eight components, one by one, in English at 1440 and 320 px in both themes).
  `node tools/audit/audit-playground.cjs dist --components`.
* **The layout checks** of the platform on the same views (no sideways scroll, nothing outside the viewport, text ≥ 11.5 px, targets ≥ 24 px, header controls, upscaled images): 0 findings.
* **The journey** (`tools/e2e/playground-journey.cjs`, real Chrome): validation messages in the page's language, `aria-invalid`, the status announcements, keyboard operation of a link, the radio group, a switch, a slider and the reset button, a visible focus,
  no focus trap, the system's reduced-motion setting, a phone and 320 px.
* **Source tests**: native controls only, the labelled scroll box, a name on every colour picker and a legend on every palette row, no `tabindex` above 0.

## 3. Found by testing and fixed

| # | Found by | What | Fix |
| --- | --- | --- | --- |
| A1 | a precaution, taken while a forced click in the journey failed (that failure turned out to have another cause, the 768 px preset, see [TEST_RESULTS](TEST_RESULTS.md) §7) | A sticky bar can cover a control that takes keyboard focus. **Not observed** in a keyboard test; prevented by design. | `scroll-margin-block` on every focusable element of the page; the bar is sticky only from `md`. |
| A2 | review of the first version | The theme radios read their help sentence twice (once per option). | The help text was removed from the options; the page's introduction says it once. |
| A3 | journey (names) | "Copy" plus a hidden ": Copy the value of …" made a name that repeated itself. | `aria-label` that starts with the visible word. |
| A4 | journey | The heading style ignored the visitor's line height, letter spacing and typeface, because the site's own rule for headings sets them on the element. | The three styles set their own family, spacing and line height. (This is a correctness bug that is also an accessibility one: *text spacing* controls must reach the text.) |

## 4. Not done

* **No screen reader** (NVDA, JAWS, VoiceOver, TalkBack) was used: only axe's rules, the accessibility tree through Playwright's role queries, and reading the markup.
* **No forced-colours / high-contrast mode, no 200 % or 400 % browser zoom on a real browser, no voice control**, no physical device. The 320 px check is the reflow of WCAG 1.4.10 in an emulated viewport.
* **No manual keyboard test by a person**; the keyboard checks are scripted.
* The contrast of a **visitor-made palette** is deliberately not audited (it can be unreadable by choice); the report on the page is the check, and the journey covers it with a flat grey palette.
