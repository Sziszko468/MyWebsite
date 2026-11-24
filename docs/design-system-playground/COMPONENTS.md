# Components and controls

Part of the [Design System Playground](README.md). Where every component in the playground comes from, what a visitor can change on it, and what was left out and why. The
brief's rule: *use actual existing components, do not create duplicates, do not expose admin-only or security-sensitive components.* A test checks the first two (the component
laboratory imports the real files and defines no component named like one of the site's) and the third (it imports nothing from the administration, the security code, the portal, the
quotes, the booking, the contact form or the assistant, and the word "admin", "password", "secret" or "login" does not occur in it).

## 1. The components in the component laboratory

| Component | Source in the project | What a visitor can change | Sample content |
| --- | --- | --- | --- |
| **Buttons** | `src/components/Button` | variant (primary, secondary, text), size (small, medium, large), arrow, full width, disabled, outcome (none, success, error); pressing it shows the real **loading** state (`aria-busy`, a spinner, the label swap) for 1.4 s | the label "Press me" |
| **Badges** | `src/components/Badge` | the four project states (the site's own labels: live, demo, in progress, concept) and the neutral label | none for the states (the site's words); "Badge" for the neutral one |
| **Form fields** | `src/components/form/fields.tsx` (`TextField` with and without `multiline`, `SelectField`, `CheckboxField`) | invalid (the site's error message with its icon), hint, disabled | labels and one hint and one error sentence; what is typed stays in the preview |
| **Links** | `src/components/LocalizedLink`, `src/components/Button` (text variant) | underline on/off | one sentence |
| **Navigation** | `src/components/MainNav` | header bar or footer column variant | none: the site's own six pages from the page registry; the current page is marked, and a link does not leave |
| **Section heading** | `src/components/SectionHeading` | size (default, large, stacked), description, index | a title and a description |
| **Service card** | `src/components/ServiceCard` (with `PriceTag`) | featured, the price state (*by quote* or *to be confirmed*), the action button | a name and a description. **No amount**: the site never makes a price up, and neither does the playground |
| **Project card** | `src/components/ProjectCard` with `src/components/home/ProjectMockup` | six layouts (default, lead, offset, compact, wide, row), four states, linked or not | a sample project, marked "Sample card"; the picture is the site's generated *concept sketch*, labelled as one |

Each has: a live preview on a stage that carries the visitor's colours and theme, its variants as controls, a sentence about it, its source, and **Reset this component** (which also
starts over what the preview keeps for itself: typed text, a pressed button).

### Left out, with the reason

| Not shown | Why |
| --- | --- |
| `Section`, `PageHero`, `Container` | `Section` takes the site's theme and sets a theme of its own on its element, which would reset the stage's tokens; the other two are page frames, not parts. |
| `MainNav`'s `panel` variant, `ServicesMenu` | The panel is the mobile menu's dialog list; the menu is the header's dropdown. Both need the header around them. |
| `LanguageSwitcher`, `ThemeToggle` | They **change the real language and the real theme**, which the playground must never do. |
| Anything under `src/admin`, `src/security`, `src/portal`, `src/booking`, `src/contact`, `src/ai`, the quotes | Administration or security-sensitive, or tied to a real backend. |
| The Lab's experiments, `Reveal`, `KineticText`, `PageTransition` | The brief says not to recreate the Lab. `Reveal` hides only what starts below the window (and reads the window, not a box), so the scroll example uses the same tokens in its own small observer; the page transition is shown as a concept, since the real one is the router's. |

## 2. The controls the playground is made of

All are existing components; none was written for the playground.

| Control | Source | Used for |
| --- | --- | --- |
| `LabSlider` | `src/components/lab/ui/LabControls` | every number: size, weights (Archivo), line height, spacing, width, container, columns, gap, padding, radius, preview width, duration, distance, stagger. A native `<input type="range">` with a visible label, a live value (`<output>`) and `aria-valuetext`. |
| `LabChoice` | same | typeface, scale ratio, weights (system/mono), component, component choices, alignment, device, easing, pair colours, preview theme. A `<fieldset>` of native radios. |
| `LabToggle` | same | on/off properties and the reduced-motion switch. A native checkbox with `role="switch"`. |
| `TextField`, `SelectField`, `CheckboxField` | `src/components/form/fields.tsx` | the HEX fields (label, hint, error with `aria-invalid` and `aria-describedby`), the visitor's own words, the previews of the form fields. |
| `Button` | `src/components/Button` | Copy, Restore, Reset, Replay, Copy CSS, and the previews. |

The native colour picker (`<input type="color">`) is used as it is, with an `aria-label`.

## 3. The controls and their bounds

| Laboratory | Control | Range | Step | Notes |
| --- | --- | --- | --- | --- |
| Colour | HEX field | 3 or 6 hex digits, `#` optional, any case | — | refused with the reason: empty / a character that is not a digit / the wrong number of digits; at most 12 characters are taken by the field, 24 kept by the state |
| Type | typeface | Archivo, system UI, monospace | — | nothing else, and nothing downloaded |
| Type | body size | 12–40 px | 1 | heading = size × ratio³, caption = size ÷ ratio (never under 10 px) |
| Type | heading / body weight | Archivo 100–900; system and monospace: regular or bold | 100 | a weight the family has no use for snaps to the nearest it has |
| Type | line height | 0.9–2.2 | 0.05 | |
| Type | letter spacing | −0.08–0.4 em | 0.01 | |
| Type | width | 62–125 % | 1 | Archivo only; removed for the others |
| Type | scale ratio | 1.125 / 1.2 / 1.25 / 1.333 / 1.5 | — | |
| Type | own words | heading 80, paragraph 400, caption 80 characters | — | control characters removed, one line, shown only as text |
| Layout | container | 280–1280 px | 10 | |
| Layout | columns | 1–6 | 1 | fewer when the cards would be narrower than 148 px |
| Layout | gap / padding | 0–64 px | 4 | |
| Layout | corner radius | 0–40 px | 2 | |
| Layout | alignment | start / centre / end / stretch | — | |
| Layout | preview width | 320–1280 px | 8 | presets: 360, 768, 1280 (they sit on the grid) |
| Motion | duration | 80–1200 ms | 20 | default 240 = `--dur-base` |
| Motion | easing | the site's five curves | — | out (default), in-out, racing, accelerate, elastic |
| Motion | distance | 0–64 px | 4 | default 16 = `--motion-distance-md` |
| Motion | stagger | 0–200 ms | 10 | default 60 = `--motion-stagger` |
| Motion | reduced motion | on / off | — | off by default; the system's setting is also read |

A test asserts every bound, the snapping, and that a value that is not a number, not a known id or not of the right type falls back to the original.
