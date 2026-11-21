# Lab 2.0: accessibility

What the Lab does for visitors who do not use a mouse, a screen, motion or colour the way the scenes assume, what was checked **automatically**, and what
was **not** checked (screen readers, real devices). The numbers are in [TEST_RESULTS](TEST_RESULTS.md).

## Keyboard

Every function reachable with a pointer is reachable with the keyboard:

| Where | Keys |
| --- | --- |
| The page | **Tab** goes "Skip to content" → the stage → the page's controls → the panel's controls → the dock (the journey records the order: the skip link, then the stage). The stage's name says what it is and how to use it ("An interactive particle system. The pointer or the arrow keys move it; Enter or Space scatter the particles."). |
| The focused stage | **Arrow keys** move a virtual pointer (two keys held together add up); **Home** brings it back to the middle; **Enter** and **Space** are a click (a pulse, a burst, a surge). |
| The panel | Native inputs: ranges (arrows, Home/End, PageUp/PageDown), radio groups (arrows), switches and buttons (Space/Enter), text fields, the colour picker. "How to use it" is a native `<details>`: Enter/Space toggle it. |
| Full screen | The button is an ordinary button in the tab order (**Enter**/**Space**). **Escape** leaves full screen: the browser handles the native mode, the page handles the expanded fallback. Focus stays on the same button across the change (it is the same element). |
| Generative Objects | The description field submits on **Enter**; the seed field takes digits. |

The Lab never captures Tab or Escape, never traps focus, and never moves focus by itself. Keys typed into a field are never read as the stage's keys (the stage reads
keys only while it has focus, and the hidden egg's sequence ignores fields).

## Names, roles and states

* The stage is a `role="group"` with `aria-label` (each experience's own `stageLabel`), focusable only while it runs. The canvas and the picture under it are `aria-hidden`:
  they carry no information that is not also in words (the description, the list of interactions and the controls' own values are text on the page).
* Every control has a visible label. Sliders have a label, an `<output>` and `aria-valuetext`; choices are `<fieldset>` + `<legend>` + radios, and a choice's help is
  read out (visually hidden text), not only a tooltip; switches have `role="switch"`; actions are `<button type="button">`.
* The panel's toggle reports `aria-expanded` and names what it will do. The panel is hidden from every user while closed.
* **Full screen**: one button whose accessible name says what pressing it does ("Full screen" / "Exit full screen", in the page's language, with the icon `aria-hidden`),
  and a polite `role="status"` line that says what happened ("Full screen is on. Press Escape to leave it." / "Full screen is off."), including when the browser did it.
* States are never colour-only: the interactive badge is a word and a dot; each input on a tile is a word; the active full-screen button has an icon, a name and a border;
  the selected radio is a filled face, not only a colour change.
* Notices (loading, context lost, no WebGL, failed, Calm, Still) are `role="status"`. The failure notice carries a button to try again.
* One `<h1>` per page (the experience's name), a `main` landmark, the Lab's navigation is a named `nav` ("Lab navigation") with "Experience 3 of 6" for assistive technology.

## Motion

* `prefers-reduced-motion` selects the **Calm** view by default: the experience stays interactive, nothing moves by itself, and the canvas draws only while something changes.
  The visitor can pick Live or Still instead, and the choice is remembered for the session.
* The Chromatic glitch moves only horizontal slices, at most three times a second, never flashes, and is **off** under reduced motion; the grain is still.
* A panel change is drawn immediately in every view (Lab 2.0 fixed the Calm view, which used to wait for the next touch of the stage).
* Full screen and the panel use no blocking animation.
* The three views, the quality tier and the frame-rate rules (resolution first, then the tier, then Still) keep a slow device usable.

## Touch

Targets are at least 44 px (the platform's `--size-touch`) on the dock, the panel's toggle, the full-screen button and the choices; the stage keeps every gesture
(`touch-action: none`) so a drag turns the view instead of scrolling the page, and the page's scroll is always available outside the stage. A tap is a pulse, a drag is the
experience's primary interaction, nothing needs a hover, a long press, a multi-finger gesture or a right click.

## Contrast and themes

Text uses the platform's tokens, which are checked for contrast in both themes by the platform's own tests; the Lab's chrome sits on a translucent token surface. The audit
(`tools/audit/audit-lab2.cjs`) runs axe-core with the real CSP in dark and light, at five widths, in three languages, on the overview and every experience, **with the panel and the
"how to use it" disclosure open** (where most of the words are). Text drawn *inside* a canvas (Type in Motion's letters) is decoration of the experience; the same words are available as
text in the panel.

## Language

Every visible label, instruction, control, state word, error and accessible name is in Hungarian, English and Dutch; the page language (`<html lang>`) follows the route. The
journey checks that no English control or notice is left on a Hungarian or Dutch page.

## What was not checked

* **No screen reader was used** (NVDA, JAWS, VoiceOver, TalkBack). Names, roles, states and live regions are as above and axe finds no violation, which is necessary and not sufficient.
* **No physical device, no Safari, no Firefox.** Chrome (headless, desktop and a touch-emulated context) only.
* Switch access, voice control, a screen magnifier and forced-colors mode were not tried.
* The Hungarian and Dutch wording was checked by the platform's rules and spell checker, not by a native speaker.
