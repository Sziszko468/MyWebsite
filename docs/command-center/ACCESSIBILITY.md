# Accessibility

Part of the [Command Center and Digital Archive](README.md). Target: WCAG 2.2 AA. What was run is in [TEST_RESULTS](TEST_RESULTS.md); what was **not** checked is at the end of this page.

## Structure

* One `h1` per page, inside the site's `main` landmark. Command Center: `h1` → `h2` per band (map, featured work, Lab, demos, services, people) → `h3` project names. Archive: `h1` → `h2`
  (the list) → `h3` entry titles (and the empty state's title). No level is skipped (the audit checks it).
* The system bar is a `nav` with its own name, an ordered list, and `aria-current="page"` on the current stop. Its numbers are decoration (`aria-hidden`).
* Lists are lists: sectors, featured projects, experiences, demos, services, archive entries. Each archive entry is an `article` named by its title.

## The archive's controls

| Control | How it works without sight or a mouse |
| --- | --- |
| Search | A `role="search"` form, a labelled search field with a visible hint; typing filters at once; submitting does nothing (no reload) |
| Kinds | A `fieldset` with a legend and **native radio buttons** (arrow keys move and choose); each says its count; the chosen one is filled and underlined, not only coloured |
| Category, status, sort | Native, labelled selects; every option says its count |
| Clear all | A button, disabled when nothing is set; the empty state has its own |
| Results | The count is a polite status region ("6 of 14 entries shown"), so a change is said without moving the focus |
| Entries | The title is a link; *Open* is named with the entry ("Open Spendly"); *Try the demo*, *The project* and *Direct link* carry the entry's name for screen readers |
| Direct link | Focus moves to the entry, which is scrolled into view and says in words that a link opened it |

A control never changes the page's address in a way that adds a history entry, and changing a filter never moves the focus.

## Command Center

Each sector is one link whose text is its title, its sentence and its count in words ("14 entries"); the large numerals are hidden from screen readers so a count is not read twice. The pointer's light
carries no information. Featured pictures that are generated sketches say so in visible words; the Lab's artwork, the sketches and the colour swatches are hidden decoration; only a real screenshot
has a description.

## Keyboard

Everything is a link, a button, a radio, a select or a text field. The journey tabs from the search through the rail, the selects, Clear all and the last entries to the footer, uses the arrow keys on
the rail and Enter on a direct link, and checks a visible focus ring on the rail (the radio itself is visually hidden; its face shows the outline). No trap.

## Motion

Under `prefers-reduced-motion: reduce` the rows do not animate, the bands arrive at once, the hover lift is zero and the pointer light is off. With motion allowed, nothing loops. The journey checks
both with the browser's own list of running animations.

## Colour, size, reflow

* Colours are the site's tokens in dark and light; contrast is measured by axe-core on every audited view.
* Controls and standalone links are at least 44 px high on a phone (the journey measures 43 px or more).
* No horizontal scrolling at 1440, 1024, 768, 390 and 320 px; long words wrap (320 px is the width of the reflow criterion; browser zoom itself was not driven).
* The current stop, the chosen kind, the linked entry and every state are shown by more than colour.

## Not checked

No screen reader (NVDA, JAWS, VoiceOver, TalkBack) was used: names and roles are checked automatically only. No Safari or Firefox, no physical touch device, no forced-colours / high-contrast mode,
no real browser zoom or text-spacing override, no voice control, no test with disabled users. Automated checks find only part of the problems.
