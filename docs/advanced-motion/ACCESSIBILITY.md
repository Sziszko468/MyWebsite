# Accessibility and reduced motion

Part of [Advanced motion and visual experiences](README.md). What was run is in [TEST_RESULTS](TEST_RESULTS.md); what was not is at the end.

## Reduced motion: what a visitor gets

| Motion | With `prefers-reduced-motion: reduce` |
| --- | --- |
| Page entrance, Lab wipe, first-screen choreography | None; the page is simply there |
| The page being left while another loads | The same dimming, instantly: it is a state, not movement. The loading line stays, still |
| Header and language markers | Jump to the chosen item |
| Card lift, press | None (intensity 0, press scale 1); colours, borders and shadows still answer |
| Depth in the first screen, featured pictures, section stripe | Not written / not hidden: everything sits at rest |
| Cursor label, magnetic pull | Not started |
| Live scenes, Lab previews | As before: still pictures |

Switching the setting **during a visit** stops what is moving (cursor label, magnetic pull, scroll-linked depth, the Lab previews' loop) and switching it back starts it again; before this work several
scripts only read the setting when they started. The journey checks both directions for the cursor label and the depth.

## Keyboard and assistive technology

* The new markers (header line, language pill) are `aria-hidden` decoration; the current page and language are still marked by `aria-current` and their own style before any script runs.
* While a page is being loaded `aria-current` stays on the page actually shown; nothing is announced early.
* A keyboard on a card gets the same cues as a mouse (lift, border, shadow, picture zoom) in addition to the focus ring.
* Nothing traps or moves focus during a transition: the journey tabs and presses Enter while a page is still loading.
* Scrolling is never intercepted and there is no smooth scrolling.
* Restoring a position never fights the visitor: a scroll of their own cancels it.
* Forced colours: the language marker steps aside and the current language uses the system highlight.

## Nothing by motion alone

Pending navigation is also said by the loading bar's text ("Loading…") and the marker; states by `aria-current`, `aria-selected`, checked inputs and text.

## No flashing

The one flash found in the existing site (the whole page fading from nothing on the first search keystroke or language switch after a direct load) is fixed. The new effects are short opacity and
position changes; nothing blinks or repeats.

## Not checked

No screen reader (NVDA, JAWS, VoiceOver, TalkBack), no Safari or Firefox, no physical touch device, no Windows high-contrast session (forced colours is covered by a stylesheet rule and read in
code, not looked at), no browser zoom, no test with people who are sensitive to motion.
