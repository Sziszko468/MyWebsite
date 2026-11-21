# Security boundaries

Part of [Interactive project demos](README.md). What the demos can and cannot do, how the configuration is kept from becoming an attack surface, what was checked and
by what, and what is left. Nothing here was tested against production.

## 1. Trust boundaries

| Source | Trusted to… | Never trusted to… |
| --- | --- | --- |
| The website's code (`src/demos/`) | contain the demos, their reducers and sample data | |
| The administration (`content_json.demo`) | switch a registered demo on or off for a project it suits, and add short plain-text instructions | add a type, name a component, a file or an address, supply HTML or code, hide a disclosure |
| The public API answer | carry `demo: { type, instructions } \| null` | be believed: the website re-validates it (`parseProjectDemo`) |
| The visitor's input in a demo | be shown back to the same visitor, in the page | leave the page: it goes nowhere |
| The project repositories | be read, for documented behaviour | be run, called or connected to |

## 2. What a demo can never do (by construction)

* **No network**: the demo components make no request (`fetch`, XHR, beacon, WebSocket, image or script by URL). Checked by a source scan in the tests and by watching the
  browser's requests while each demo is used (none).
* **No storage**: no `localStorage`, `sessionStorage`, cookie or IndexedDB. Checked by the same scan and by comparing both storages before and after use.
* **No keys, tokens or private endpoints**: none exist in the demos or in their configuration; the admin setting contains a type id and text.
* **No production data, no paid service, no AI call**: the sample data is invented and bundled; nothing connects to a database, the project backends, an e-mail, payment,
  booking or authentication service. A booking demo "confirmation" is a summary on the page labelled as a demonstration; **no appointment exists, no e-mail is sent**; the
  finance demo takes no real amount; the shipment demo has no real shipment. No sign-in, payment or booking is imitated as if it were real (the labels say *Simulated data*
  and *Nothing is saved or sent* on every demo page).
* **No code from data**: no `eval`, `new Function`, `innerHTML`, `dangerouslySetInnerHTML`, no dynamic `import()` of anything but the three fixed lazy loaders in
  `registry.ts`. A test scans the source for these and fails on any other occurrence.
* **No new dependency, no new route or table, no new permission, no change to the Content-Security-Policy or headers.**

## 3. The configuration

* **Closed list**: `DEMO_TYPES` (3 ids). A value that is not exactly one of them (including an inherited property name such as `constructor` or `__proto__`, or a path) is not a type
  (`isDemoType` / `owns` use an own-property check; tested).
* **Eligibility by slug**: a type is valid only for the projects in `DEMO_PROJECTS`. The backend refuses to store a mismatch and the public answer omits it; the website ignores it.
  A project's address can change while it is unpublished, so `publicDemo` re-checks type against the *current* slug, not the one at save time.
* **Plain text only**: the instructions are stored as typed (≤ 400 characters per language, trimmed) and drawn as React text. Markup in them is shown, never interpreted
  (tested on the server and in the rendered website markup).
* **Unknown fields are dropped**: a hostile body with a `component`, `script`, `url` or `html` field stores none of it (tested over the wire, and the response says which field is wrong).
* **Defensive reads**: a stored `demo` that is not an object, has an unknown type or non-string text reads as "switched off" (`storedDemo`); a document from before demos existed
  has none and reads as off.
* **Permissions unchanged**: writing a project (including its demo setting) needs the existing content-write permission, with the existing authentication and permission checks (no
  new route or permission). A visitor or a stranger cannot change it (tested).
* **Duplicate**: a copied project starts with the demo off (a copy has another slug).
* **Preview**: an admin preview of a draft never shows the demo entry and the demo page answers *not found* for it, so a draft's demo state cannot leak through the demo route.

## 4. Input validation inside the demos

Every field is validated by the model (not by the markup): amounts parse from text to integer cents and are bounded (`MAX_CENTS` = 1,000,000.00), descriptions are bounded
(60), names (80) and e-mail (120) are bounded and format-checked, notes (200), searches (60); dates must be real days inside the sample period; a select's value must be one of
the registered options; counts are capped (at most 40 sample bookings). A refused input names the field and changes nothing. The models are unit-tested with hostile values
(empty, too long, negative or zero, exponent notation, impossible calendar dates, `NaN` page numbers, unknown ids), see [TEST_RESULTS](TEST_RESULTS.md).

Forms use `autocomplete="off"`; browsers may still offer saved data, so the booking form says plainly that invented details are fine. What a visitor types stays in the page's memory
and disappears on reload; it is never sent.

## 5. Isolation

* One demo's state cannot reach another's: each is a separate component with its own reducer; nothing is module-global and mutable (tested: a source scan finds no module-level mutable store, and every restart builds a fresh state).
* A demo that throws is contained by an error boundary: the frame, the project's page and the site's navigation keep working; the visitor gets *Try again* and a link back.
* The demo never traps the visitor: it is part of an ordinary page. In full screen, a visible button and Escape leave it; leaving the route leaves it.

## 6. Findings

Findings from this work, in the order they were found. None is a vulnerability in the released behaviour; they are listed so nobody has to rediscover them.

| # | Finding | Status |
| --- | --- | --- |
| S1 | A demo type could outlive the slug it was made for if a draft project's address were changed after the demo was switched on. | **Fixed**: `demoSuits` on every create/update with the post-save slug, `publicDemo` re-checks, the website re-checks. Tested. |
| S2 | A lazy chunk that fails to load stays rejected for the life of the page, so "retry" would otherwise show the same error. | **Fixed**: `freshDemoComponent`. Tested in the journey (a blocked chunk, then a retry). |
| S3 | A copy of a project would have inherited a demo made for the original's slug. | **Fixed**: duplicate resets `enabled`. Tested. |
| S4 | Existing production rows have no `demo` setting, so the entry will not appear in production until an administrator enables it in the admin (the seed only fills an empty projects table, so re-seeding changes nothing). | **Open, by design** (safe default). Production prerequisite: [LAUNCH_CHECKLIST](LAUNCH_CHECKLIST.md). |
| S5 | Browsers can ignore `autocomplete="off"` and offer real personal details for the booking form. | **Mitigated, not removable**: nothing leaves the page, the form says invented details are fine. |
| S6 | The admin's instructions are public text written by a trusted administrator. | **Accepted**: plain text only, bounded, drawn as text, tested with markup. |
| S7 | A dependency audit (`npm audit`) was **not run** for this task, because no dependency was added or changed. | Not done. |

## 7. What was and was not checked

* **Checked by automated tests**: the closed list and its three-way sync; the admin setting (valid, hostile, oversized, non-text, markup, unknown fields, permissions, duplicate,
  old documents); the models of the three demos; the rendered frame and entry markup; the absence of network/storage/code-execution APIs in the demo source.
* **Checked in a real browser** (headless Chrome, production build with its real Content-Security-Policy for the audit; dev server for the journey): no request and no storage
  change during use; no console error across the audit matrix; a failed chunk and a retry; an unsupported browser; cleanup after leaving.
* **Not checked**: a penetration test, a review by a second person, production behaviour (headers/CDN/Cloudflare in front), Safari/Firefox, a physical device, `npm audit`.
