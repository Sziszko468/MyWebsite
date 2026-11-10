# Controlled Chaos — portfolio

React + TypeScript + Vite. Racing Red edition: Dark and Light themes, three languages (hu default, en, nl).

```bash
npm run dev        # dev server; /hu/design-system shows every token and component
npm run build      # type-check + production build + one HTML file per page, sitemap, robots.txt, _headers (VITE_SITE_URL: see "Search, speed, accessibility and security")
npm run check:seo  # after a build: reads dist/ like a crawler (titles, canonicals, hreflang, sitemap, structured data, CSP hashes)
npm run typecheck  # tsc -b
npm run lint       # oxlint
npm run server:start   # the backend (see "Backend"); first: npm run server:admin create you@example.com admin
# the administration is a second page of this project: `npm run dev` serves it at /admin (with the backend running; docs/admin/README.md)
npm test           # vitest: contrast, i18n parity, page registry, language switching, theme, hero input logic, geometry, intro policy and transition, home-page content, rhythm and link targets, project-page content, pictures and meta, services content and wording, quote-form validation and sending, the services, About and contact pages rendered in three languages, the About content's honesty rules, the contact form's validation and sending, the configured links, the motion system (config against the CSS tokens, the engine's modules, its components rendered to markup, every stylesheet's animations)
```

## Where things live

| Path | What |
| --- | --- |
| `src/styles/tokens.css` | The design tokens. Brand palette, scales, and one semantic colour block per theme. Change values here only. |
| `src/styles/global.scss`, `_mixins.scss` | Reset, global focus ring, theme-transition rule; breakpoints and interaction mixins. |
| `src/theme/` | `ThemeProvider`, `useTheme`, storage and resolution logic. `index.html` holds the matching pre-paint script. |
| `src/i18n/` | `config.ts` (languages), `locales/*.ts` (dictionaries), `paths.ts` (URL helpers), `I18nProvider`. |
| `src/routes/pages.ts` | The page registry: which pages exist, their paths and languages. Router, navigation, footer, titles and the language switcher all read it. |
| `src/routes/` | `LanguageLayout` (`/:lang/*` guard, providers, shell) and `languageSwitch.ts`. |
| `src/components/` | UI kit (Button, Container, SectionHeading, Badge, ProjectCard, ServiceCard) and the global frame: `AppShell`, `SiteHeader`, `MainNav`, `BrandMark`, `MobileMenu`, `SiteFooter`, `MainContent`, `SceneLayer`, `ThemeToggle`, `LanguageSwitcher`. |
| `src/components/hero/` | The Home hero ("Velocity Field"): kinetic headline, input drivers, generated SVG fallback and the lazily loaded Three.js scene. It is also the engine of the intro. See below. |
| `src/components/intro/` | The fullscreen opening ("Velocity Intro"): state machine, show/skip policy, exit transition, the dialog and its entry button. See below. |
| `src/components/home/` | The home page's sections after the hero (path chooser, selected work, what I build, about, lab, packages, closing call to action) and their drawings. See "The home page" below. |
| `src/components/Section/` | `Section`: a band that wears its own theme. |
| `src/motion/` | The motion system's engine, without a screen: `config.ts` (the numbers and the scopes), the shared in-view observer and scroll bus, the page frame (`PageTransition`, `ScrollManager`, `scrollRestoration`), loading (`loading.ts`), kinetic type splitting, the magnetic pull and the cursor label's maths, `closeDialog`. See "Motion" below. |
| `src/components/motion/` | The motion system's components: `Reveal`, `RevealImage`, `KineticText`, `ScrollLinked`, `LoadingBar` and `Spinner`, `CursorLabel`, plus the older `usePointerField` (pointer variables for CSS) and `SpeedLines`. |
| `src/styles/motion.css` | The few global motion rules that belong to no component (the language switch's cue, the touch tap highlight). |
| `src/content/` | The editable data: projects, areas of work, packages, lab experiments. Mostly structure; the words are in the dictionaries, or beside the data in three languages (`tri(hu, en, nl)`). |
| `src/content/lab.ts`, `src/content/labText.ts` | The Lab's list of its five experiments (name, number, status, technology, one-line description) and the words of its pages in three languages. See "The Lab" below. |
| `src/components/lab/` | The Lab: the shared graphics core (`core/`), the interface (`ui/`, `experience/`), the overview page (`page/`), the hidden racing experience (`easter/`), the saved works (`artifacts/`) and one folder per experience (`experiments/`). See "The Lab" below. |
| `src/content/about/` | The About page's personal content: the story and the seven transferable skills (`story.ts`), the four principles (`approach.ts`), the technologies (`skills.ts`), the current focus (`focus.ts`), each with its text in three languages side by side. See "About page" below. |
| `src/content/projectDetails/` | The project pages' content (`spendly.ts`, `bookinghub.ts`, `logistics.ts`), each with its text in Hungarian, English and Dutch side by side (`tri(hu, en, nl)`), and `meta.ts` for their titles and descriptions. See "Project pages" below. |
| `src/components/project/`, `src/pages/ProjectPage.tsx` | One page component for every project: the hero, the eight bands, the architecture diagram, the gallery with its lightbox, the previous/next links. Loaded as its own chunk. |
| `public/projects/<slug>/` | The optimised screenshots (WebP, at most 1440 px wide). |
| `src/content/services/` | The shop's catalogue and its editable content: `ids.ts` (services, needs, plans), `areas.ts` (the four service areas), `detail.ts` (each service's product page: promise, overview, benefits, deliverables, audience, related projects, questions), `addons.ts` (the optional extras), `process.ts` (the five steps, what happens after an inquiry, how we communicate), `faq.ts` (the six questions), each with its text in three languages side by side. The packages are in `src/content/packages.ts`, shared with the home page. See "Shop" below. |
| `src/content/shop/` | The shop's interface words in three languages (`tri(hu, en, nl)`): `common.ts` (names, price wording, announcements), `landing.ts`, `detail.ts`, `configurator.ts`, `cart.ts`, and `meta.ts` (page titles, kept small so the page frame can read them). |
| `src/shop/` | The shop without any screen: the cart (`cart.ts`, `cartStore.ts`), prices (`pricing.ts`), the inquiry's rules and the request that is sent (`inquiry.ts`, `inquiryStore.ts`), search, paths and the way through the builder. Plain functions, tested without a browser. |
| `src/components/shop/`, `src/pages/ServicesPage.tsx`, `ServiceDetailPage.tsx`, `ConfiguratorPage.tsx`, `CartPage.tsx` | The shop's screens: hero, discovery, package selector and comparison, service pages, the request builder, the cart, the header's cart link, the sticky bar. Each page is loaded as its own chunk. |
| `src/components/form/` | The form fields (labels, hints, errors and radio groups wired for assistive technology) and the result panels, shared by the request builder and the contact form. |
| `src/contact/` | The contact message without any screen: the types, the validation rules and the error wording. |
| `src/forms/` | What the forms share: `submit.ts` (the transport that sends a request, or says it cannot), `validate.ts` (e-mail and phone checks), `mailto.ts`. |
| `src/components/about/`, `src/components/contact/`, `src/pages/AboutPage.tsx`, `src/pages/ContactPage.tsx` | The About page's bands and the contact page's hero, doors, form and links. Each page is loaded as its own chunk. |
| `src/components/PageHero/` | The shell of a page's first screen (eyebrow, headline, sentence, buttons over a faint light field), used by the About and contact pages (the shop has its own hero). |
| `src/pages/` | Home, the shop's four pages, About, contact, project pages, the Lab and its experiments, a placeholder page (Work), 404. `DesignSystemPage` exists in dev builds only. |
| `src/config/site.ts` | The site address (`VITE_SITE_URL`), brand name, monogram, contact email, social profiles, legal pages. Every `null` is a placeholder. |
| `src/config/links.ts`, `src/config/contact.ts` | The links the contact page shows (read from `site.ts`), and where the contact message is sent. |
| `src/config/quote.ts` | Where the request builder's inquiry is sent (`VITE_QUOTE_ENDPOINT`) and whether the visitor has to tick the acknowledgement of how the data is used. |
| `src/config/intro.ts` | When the intro appears (`first-visit`, `every-session`, `never`), whether it opens only on the home page, whether visitors can skip it, how long the exit lasts. |
| `src/seo/` | The head of every page (title, description, robots, canonical, hreflang, Open Graph, structured data), as data: applied by the browser (`apply.ts`) and printed into each page's HTML by the build (`html.ts`, `entry.ts`); `sitemap.ts`, `siteUrl.ts`. See "Search, speed, accessibility and security". |
| `src/security/headers.ts` | The Content-Security-Policy and the other headers the site should be served with, written to `dist/_headers`. |
| `src/analytics/`, `src/components/Consent/` | Consent-gated, provider-independent measurement (off unless `VITE_ANALYTICS_ENDPOINT` is set) and its question. |
| `src/components/ErrorBoundary/` | What a visitor sees when a page's code cannot be fetched or a page throws. |
| `src/content/privacy.ts`, `src/pages/PrivacyPage.tsx` | The privacy and cookie notice (`/privacy`). |
| `scripts/` | `prerender.mjs` (per-page HTML, sitemap, robots, headers), `check-seo.mjs` (checks the built files), `make-og-image.mjs` (draws `public/og/default.png`). |
| `docs/technical-audit.md` | The PROMPT 11 audit: issues found, fixes, measured results, limits. |
| `server/` | The backend (PROMPT 12): a Node program with no runtime dependencies and a SQLite file. `src/` (config, `app.ts`, `http/`, `db/` with the SQL migrations, `modules/` for contact, quotes, catalogue, shop pricing, auth, admin, notifications, system), `seed/catalog.seed.json` (the website's catalogue as data), `test/` (422 tests run by `npm test`). See "Backend" below. |
| `src/admin/`, `admin.html` | The administration (PROMPT 13): a React single-page application served by the backend at `/admin` — dashboard, inquiries, quote requests, services and packages, website content (the FAQ), translations, notifications, settings. It reuses the website's tokens, theme and button, talks only to `/api/admin/*`, and is never loaded by the website (a test enforces it). See `docs/admin/README.md`. |
| `docs/cms/` | `README.md`: the content management added in PROMPT 13.1 — what the owner can change from the administration (portfolio projects, pictures, the website's wording, the shop's catalogue), the project document, states and what visitors see, preview, how a change reaches the website and how long it takes, security, what was tested, and what was not done. |
| `docs/admin/` | `README.md`: information architecture, what each screen does, components, endpoints reused and new, the database change, security, accessibility, tests and what the real-browser run found, and what is not there. |
| `tools/audit/audit-admin.cjs` | The administration in a real Chrome: every screen × viewport × theme × language, layout and axe-core, the dialog and the phone menu's focus behaviour. |
| `docs/email/` | `README.md`: how the site receives and sends e-mail (PROMPT 14): the architecture, the provider and why, addresses, delivery states, the signed webhook, confirmations, Cloudflare Email Routing and DNS checklists (manual steps), production checklist, and what was **not** verified. |
| `docs/release/` | `final-quality-report.md`: the final integration pass (PROMPT 15): the audit and its prioritised issue list, what was fixed, the feature-by-feature status, the technical results, what is outstanding, what needs the owner, and the verdict. |
| `docs/production/` | `README.md`: the production-readiness checklist, every item marked Verified / Requires manual configuration / Not implemented / Blocked. |
| `tools/e2e/` | End-to-end journeys (recruiter, client, administrator, phone, hidden racing experience, localised error messages), the portfolio's whole life through the administration (`cms-journey.cjs`) — through the built site served by the real backend, and a security probe of the running server (README there). Not part of `npm test`. |
| `docs/quotes/` | `README.md`: quotation and order management (PROMPT 17): references, statuses, the quotation and its versions, secure customer links, the e-mails, security and privacy; `integration-report.md` (what was reused), `production-checklist.md`, `live-verification.md` (**not performed**), `final-report.md`. |
| `docs/ai/` | `README.md`: CONTROL ROOM AI (PROMPT 16): the assistant's architecture, the model and key, the eight tools, what the server enforces, the planner and the approval, budgets, privacy and retention, the administration, operating it, tests, deviations and what was not verified. |
| `src/ai/`, `src/components/ai/`, `src/content/ai/` | The assistant's browser side: the client and shared conversation, the floating panel / chat / plan / history components, and every word of its interface in three languages. The page is `src/pages/ControlRoomPage.tsx`. |
| `docs/backend/` | `README.md`: configuration, every endpoint, the administration, e-mail, privacy inventory, deployment, test results and what was not verified. `architecture.md`: the audit and the design, written before the code. |
| `.env.example` | Every setting of the backend and of the website's build, with descriptions and no secret. |
| `src/config/api.ts` | `VITE_API_URL`: where the backend is. The forms' endpoints (`config/contact.ts`, `config/quote.ts`) default to its `/api/contact` and `/api/quote-requests`. |
| `src/content/catalogExport.ts`, `catalogOverlay.ts` | The static catalogue as seed data for the backend, and the overlay that lays the backend's edited prices, texts and FAQ over it at build time (`npm run catalog:pull`). The files with the packages, add-ons and FAQ export their static `base…` lists and the overlaid ones. |

## Conventions

- **Colours:** components use semantic tokens (`--color-*`), never hex values. Raw brand colours (`--brand-*`) are for tokens and decorative art.
- **Themes:** `data-theme="dark|light"` on `<html>`. Dark is the default. The choice is stored in `localStorage` under `theme`; without one, the system setting applies. The semantic token blocks are selected by `[data-theme]` alone, so any element can carry a theme of its own: that is how a band of the home page is light on a dark page (see `Section`).
- **Strings:** every UI string comes from `src/i18n/locales/*`. `hu.ts` defines the shape, so `en.ts` and `nl.ts` fail to compile when a key is missing or extra.
- **URLs:** `/hu/`, `/en/`, `/nl/`; `/` redirects to `/hu/`. Slugs are the same in every language. The language switcher keeps the current page, query and hash; a page with no translation in the chosen language links to that language's home page, and opening such a page directly redirects to its Hungarian version.
- **Adding a page:** add it to `src/routes/pages.ts` and to `PAGE_ELEMENTS` in `src/App.tsx`. Add its label to `nav` in the dictionaries if it belongs in the navigation.
- **Placeholders:** Work currently renders `PlaceholderPage`. Social profiles and legal links without a real address are hidden in production and shown as muted labels in development; they never render as links.
- **Header:** sticky, `--header-height` tall. Pages own their vertical padding (`<main>` adds none), and anchors respect the header via `scroll-padding-top`.
- **Scene layer:** the hero's 3D canvas lives inside `SceneLayer` (behind content, never captures input, isolated by an error boundary). A section that should run under the header uses the `under-header` mixin from `_mixins.scss`.
- **Hosting:** the build writes one HTML file for every page and language (`dist/hu/services/index.html`, …), `404.html` and the headers; the app still works behind a host that answers every address with `index.html`. See "Serving the site".

## Motion

One system, not a set of effects: the numbers live in one place, every kind of page has a strength of its own, and everything that moves says what it is for. There is no animation library; it is CSS, a few small modules (`src/motion/`) and the Web Animations the browser already has.

### The identity

Controlled acceleration, soft landings, one asymmetric "racing" curve (a late launch and a long brake), a slight elastic settle for small deliberate moments, Racing Red only on the state that matters. The numbers are CSS custom properties in the "Motion" section of `src/styles/tokens.css` and the same numbers in `src/motion/config.ts` for scripts; `config.test.ts` reads both and fails if they differ.

| What | Values |
| --- | --- |
| Durations | `--dur-instant` 80, `-fast` 140, `-base` 240, `-slow` 420, `-scene` 700 ms |
| Curves | `--ease-out` (arrives), `--ease-in-out` (moves between two shown states), `--ease-accelerate` (leaves), `--ease-racing` (the brand's own), `--ease-elastic` (a pop, nothing large) |
| Distance | `--motion-distance-sm/md/lg` 8, 16, 32 px |
| Stagger | `--motion-stagger` 60 ms per sibling, capped at 360 ms (a long row never waits for its last item) |

### Scopes

`data-motion-scope` on the app shell is set from the page (`scopeOfPage` in `config.ts`) and scales everything inside it: `--motion-intensity` multiplies every distance, `--motion-time` every entrance duration.

| Scope | Pages | Intensity | Time | A new page arrives |
| --- | --- | --- | --- | --- |
| `site` | Home, anything else | 1 | 1 | fade, 280 ms |
| `portfolio` | About, contact, project pages | 1 | 1 | fade, 360 ms |
| `shop` | Services, a service's page | 0.5 | 0.6 | fade, 140 ms |
| `checkout` | The request builder, the cart | 0.25 | 0.4 | fade, 100 ms; reveals and kinetic type are switched off |
| `lab` | The Lab and its experiences | 1.35 | 1.25 | a diagonal wipe on the brand's slant, 560 ms |

To retune the site, change a value in `tokens.css` and in `config.ts` (the test says which one you forgot). To give a page another character, move it between scopes in `scopeOfPage`; to add a scope, add a `[data-motion-scope='…']` block to `tokens.css` and an entry to `MOTION.scope`.

### The page frame (`routes/LanguageLayout.tsx`, `src/motion/`)

- **No blank frame, no loading screen.** The router navigates in a React transition and one `Suspense` boundary for every lazy page sits above the keyed wrapper, so while the next page's code is on its way the current page stays on screen, and the swap happens when the new one can be drawn. (An earlier version gave each page its own boundary inside the wrapper; the browser run found a blank content area for the length of the download, and `pageFrame.test.ts` now guards the structure.) The fallback appears only when a visit starts on a page that has not arrived.
- **`PageTransition`** keys the page by its language-free path, so a language switch does not replay the entrance (a quiet dip in opacity on `<main>` marks the swap instead). Only opacity and `clip-path` animate, never a transform on the wrapper (it would become the containing block of every fixed bar). The first page of a visit does not animate; Back and Forward arrive in 40 % of the time; nothing animates under reduced motion.
- **`ScrollManager`** replaces the browser's own scroll restoration (which cannot work for a page drawn by script): a new page starts at the top, Back and Forward return to where that entry was left (positions per history entry in `sessionStorage`, the 60 latest, restored once the page is tall enough, given up if the visitor scrolls first), a `#fragment` scrolls to its element once it exists, a language switch stays where it is. Scrolling itself is never intercepted: no snapping, no smooth-scroll takeover, no scroll lock outside dialogs.
- **Loading** (`motion/loading.ts`, `components/motion/Loading.tsx`): `lazyRoute` counts the chunks in flight and `LoadingBar` (a 3 px line along the top, announced as "Loading…" in the page's language) shows after 140 ms of waiting, so a fast load flashes nothing. It is indeterminate on purpose: the browser reports no percentage for a dynamic import, so none is invented. A button that waits for a request says so itself (below).

### Type (`components/motion/KineticText.tsx`, `motion/kinetic.ts`)

For the headlines that deserve it, never a paragraph: the page heroes, section titles and a project's title. Three variants: `mask` (each word rises out of its own clip, the signature), `words`, `chars` (letter by letter, up to 28 characters, `mask` beyond). Every word is real text in reading order with real spaces between, so find, copy, translation and screen readers get the sentence as written; nothing is hidden from assistive technology and no label repeats it. The boxes keep the line exactly as wide and tall as plain text (padding and negative margin for accents and descenders), a hyphenated word still breaks at its hyphen (`<wbr>`), the stagger is capped, and only `transform` and `opacity` move. It starts visible: the hidden state is set only in the browser, only for text below the fold, never under reduced motion or in the checkout.

### Scroll (`Reveal`, `RevealImage`, `ScrollLinked`, `motion/inView.ts`, `motion/scroll.ts`)

`Reveal` (variants `rise`, `fade`, `scale`, `left`, `right`) lets a block arrive once; what is on screen at mount is never hidden. `RevealImage` fades in only an image that is still loading, in a box of its own size. `ScrollLinked` hands an element `--sp` (0 to 1 through its pass) and CSS turns it into a small parallax shift (the shop's tile stack, a service's drawing, a project's backdrop) or a filling line (the shop's process rail). All of it shares one pooled `IntersectionObserver` and one passive scroll listener that reads before it writes once per frame and writes only for elements on or near the screen. A touch screen moves things half as far (`--motion-parallax`), the shop less (its intensity), the cart has none, and reduced motion writes nothing.

### Pointer and controls

- **Cursor** (`CursorLabel`): an additive label ("View service", "Open") that follows a mouse over any `[data-cursor]` card. The native cursor is never replaced or hidden, the label is `aria-hidden`, it disappears over inputs, while the mouse button is held, on scroll and on leaving the card, and a touch screen never sees it. Text selection and fields work as everywhere.
- **Magnetic** (`Button magnetic`, `useMagnetic`): only a large call to action (at least 112 × 44 px) leans toward a mouse, by at most 6 px; fine pointers only, never on the cart or the builder, never under reduced motion.
- **Button states:** default, hover, `:focus-visible` ring, pressed (scale 0.985), disabled, **loading** (`loading` and `loadingLabel`: `aria-busy`, a spinner in the arrow's place, the same width because both labels share a cell, focus kept, a second press does nothing), **success** (`status="success"`, a tick pops in) and **error** (`status="error"`, one short shake). The contact form and the request builder use `loading`.
- **Fields:** a border that warms on focus; a field that has just been marked wrong shakes once a couple of pixels and its message arrives with a short fade (under reduced motion the frame and the message say it); choices give press feedback; a sent request ends in a Racing Red tick.

### Navigation

- **Header:** a red indicator slides under the active link (measured from the label, with the per-label underline as the fallback); hover, focus and active states are distinct.
- **Services dropdown** (`MainNav/ServicesMenu.tsx`): the entry still links to the Services page; a button beside it opens the menu (the four services, packages, builder, cart). It is a disclosure, not a hover trap: Enter, Space, click or Arrow Down open it (Arrow Down moves in), a mouse resting on the entry opens it after 90 ms and leaving closes it after 200 ms, Escape and any outside click or navigation close it, Escape returns focus to the button, and the closed panel is `inert`.
- **Mobile menu and lightbox:** native `<dialog>`s with an enter and an exit (`motion/dialog.ts`, a timer is the fallback if `animationend` never comes); choosing a link navigates at once, the exit never holds it up, focus goes in and returns to what opened it.
- **Theme and language:** the theme change is the existing 320 ms colour cross-fade; the language switch dips `<main>` and keeps the page and its scroll position.

### The Lab

The `lab` scope is the most expressive (wipe between pages, 1.35 × distances), and its stages already paid for themselves: a loop runs only while it is on screen and the tab is visible, the frame rate steps the quality down, and reduced motion draws one still frame. The hero scene on the home page now also waits in a hidden tab and pauses the fallback's drifting streaks while the canvas covers them. **The Lab has five experiences.** A brief listed a sixth, "Generative Objects" with an AI-generation progress display; it was deleted from the project on 2026-11-01 and is not rebuilt here. The hidden Racing experience is untouched.

### Reduced motion

`prefers-reduced-motion: reduce` collapses every duration token to 0.01 ms, sets the intensity and the parallax to 0, drops the page wipe and the entrances, stops looping decoration, leaves the Lab on a still frame and does not write scroll variables. What *says* something stays: the loading line (still, but present), a tick, a message, a changed border, the spinner (it pulses instead of turning). Nothing is information by motion alone.

### Performance rules, and the test that keeps them

`src/styles/motion.audit.test.ts` reads every stylesheet: keyframes animate only `opacity`, `transform`, `translate`, `scale`, `rotate` or `clip-path` (three named exceptions: two decorative `stroke-dashoffset` drifts and the home hero's `background-position` sweep); no transition touches layout; no `transition: all`; every infinite animation either starts only inside `prefers-reduced-motion: no-preference` or is switched off in a reduce block; the shop's stylesheets have no delay that is not a token. Scripts: one observer pool, one scroll listener, `requestAnimationFrame` only while something moves, `passive` listeners, everything removed on unmount. A loop on an invisible element is work too: the loading line animates only while shown.

### Tests and what was checked

All browser checks are **Chrome driven by Playwright on one PC: emulated viewports and synthetic touch, not physical devices.** No physical phone or tablet, Safari, Firefox, screen reader or measurement of the GPU was involved; the GPU load of the Lab's scenes is not known.

**Unit, render and source tests** (`npm test`, 982 tests in 44 files; 914 in 39 before the motion work): the config equals the CSS tokens and the scope relations hold (`config.test.ts`); the pooled observer, the shared scroll listener (one listener, one frame, reads before writes, detaches at zero), kinetic splitting (hyphens, accents, emoji, the 28-character limit), the loading count, the magnetic maths and size limit, the cursor label's placement and opt-outs, the scroll-position store (cap, corrupt or blocked storage, restore targets, what a navigation does about the scroll); `KineticText`, `PageTransition` (per scope, first page, Back and Forward), `Button` states, `ServicesMenu`, `Reveal`, `RevealImage`, `ScrollLinked` and `LoadingBar` rendered to markup in three languages (text equal to the sentence as written, closed and inert before any script, nothing hidden before the browser decides); the page frame's structure (`pageFrame.test.ts`); and `motion.audit.test.ts` over every stylesheet.

**Browser checks** (scripts were kept in a scratch folder, not in the repo):

- **Page frame, navigation and pointer, 20 of 20** (a script samples `<main>` on every frame): no blank or header-less frame on home → services → cart → Lab → about (53 to 116 frames each; it was 15 to 38 bad frames per transition before the single `Suspense`), each scope's entrance as configured, a 900 ms slow chunk keeps the current page and shows the loading bar with its text, a direct address does not animate, Back and Forward restore the scroll (home 2836 → project 0 → Back 2836), a language switch keeps the page mounted and the scroll, the theme switch sets and clears its flag without a shift, the indicator sits under the active link on every main page, the dropdown opens and closes by mouse and by keyboard (Enter, Arrow Down, Escape and where focus goes, Tab out, outside click, navigation), every header stop shows a focus ring, the cursor label shows for a mouse and not over a field, text can be selected and typed, a large hero button leans at most 6 px and a header link not at all, a touch screen has no label and no pull, the mobile menu has focus inside, animates its exit and navigates in about 60 ms, the mobile header's controls are at least 40 px.
- **Reduced motion, 17 of 17**: on 15 pages (home, project, About, contact, the shop's four, the Lab and its five experiences) after scrolling through each, no animation runs, nothing is left hidden, intensity and parallax read 0, the wrapper has no animation; the dropdown, form errors (no shake) and the cart button still work; the phone menu opens and closes at once.
- **Forms, shop and lightbox, 5 of 5**: an empty send flags 6 fields, the first shakes for 0.42 s, nothing is sent; the busy button keeps its size and focus, shows a spinner, ignores a second press, sends once; a failed send ends the busy state, keeps the answers and a retry succeeds; an add-on, a package and "Add to cart" answer in 30, 37 and 57 ms and the choice area has no delayed control; the lightbox opens with an animation and leaves in 170 to 200 ms by Escape, the close button or the backdrop, with focus back on the thumbnail.
- **Loops**: requestAnimationFrame calls per second while visible, off screen, in a (simulated) hidden tab and with reduced motion: home 61 / 0 / 0 / 0, the Lab hub 60 / 0 / 0 / 0, each of the five experiences 60 to 61 / 0 / (the stage fills the page) / 0. The hidden tab is simulated by overriding `document.hidden` and firing `visibilitychange`, which the browser's own scheduling does not follow, so it shows that the code listens, not what a real background tab costs.
- **Layout matrix, 328 checks**: 1920×1080, 1440×900, 1366×768, 1024×768, 768×1024, 430×932, 390×844, 360×800, 320×640 and the landscape 844×390 and 932×430, both themes, nine pages (home, the services page, a service page, the cart, About, contact, the Lab, an experience, a project) with motion on, English everywhere and Hungarian, English and Dutch at 1440, 390 and 320 px: no horizontal overflow, no headline past the screen's edge, nothing left hidden on the first screen, header controls on screen, the bar or the menu button (exactly one), the indicator on the bar, the menu (focus inside, items at least 40 px, no overflow) or the dropdown (inside the window) at every size, no animation still running two seconds after load, no console warning. The only finding left is a layout shift of 0.14 on the cart at 768×1024 in the dev server when the cart's code is cold (the page is shorter than its placeholder; 0.01 to 0.04 in the production run below).
- **Production build** (`vite preview`): 30 pages (ten page types in three languages): a title, one `h1`, the right `lang`, no console output, no failed request, no Three.js on the shop, About, contact or project pages. With an emulated slow phone (4× CPU, about 1.6 Mbit/s, 150 ms) at four sizes, eight pages each: cumulative layout shift 0 on all but the cart (0.008 to 0.039); first contentful paint 2.1 to 4.6 s and largest contentful paint 2.5 to 5.0 s (the home page is the slowest: starting the 3D scene is a task of 1.0 to 1.6 s at this slowdown, which this work did not change). The main bundle is 134.9 kB gzip (about 129 kB before).
- **Regression of the shop**: the customer journey 23 of 23, 360 checks for words broken across lines 0, axe-core 76 audits 0 violations. The states this work added were audited too (the Services dropdown open, the phone menu open, the lightbox open, the contact form with its errors; both themes, 1440 and 390 px; 64 audits): the dropdown, the lightbox and the error states pass. The open phone menu on the home page and on the services page gets one "color-contrast" report on the last item; it comes from axe reading the red button of the page behind the modal as the background (it disappears when the page behind is hidden, and the real colours are about 7:1 on an opaque menu), so it is not counted as a defect. The contact page shows two moderate best-practice findings that were there before and were not touched (an `<aside>` inside `<main>`, and a skipped heading level): they are a follow-up.

**What the runs found, and what was done:** a navigation to a page that had not been loaded showed a blank content area for the length of the download (one `Suspense` above the page frame, and a test of the structure); the placeholder for a visit that starts on a page was shorter than the page, so the footer jumped (a screen tall: layout shift 0.2 to 0); the web font arrived after the first paint and its swap moved the centred hero (0.15 to 0.48 on the home page and the Lab in the emulated run; the font is now preloaded in `index.html`: 0); the Services dropdown opened again on the next page when the pointer was still resting on it (a click in the panel closes it, a pending hover is cancelled on navigation); the loading line kept animating while invisible, the hero's fallback streaks kept drifting under the opaque canvas and the hero scene did not wait for a hidden tab (all stopped); the submit button shrank by about 50 px while it said "Sending…" (both labels now share a cell). Several checks failed first because the script was wrong (a header link that Playwright scrolled to, a substring that matched "Diensten", a selector for an alert that is a section): those are not counted as findings.

**Not verified:** a physical phone or tablet (touch is Chrome's emulation with synthetic events), Safari and Firefox (not run: the CSS uses the individual `translate` property, `clip-path`, `inert` and `<dialog>`, which current versions support but which were not tried), a screen reader, forced-colours mode, the real cost on a GPU (the Lab's loops were counted, not profiled), a real network, and the three languages' copy by a native reader. The Lab's page wipe was verified through its attributes, its timing and the frame sampler, not looked at frame by frame; the kinetic type and the menus were looked at in screenshots from Chrome only.

## Mobile-first

Written phone-first from the start (`up()` breakpoints, fluid tokens, container queries) and audited again in PROMPT 13.2: `docs/mobile/README.md` is the reference (tokens, safe areas, touch, adaptive quality and how it gets quality back, the intro and the Lab on a finger, the Work page on a phone, responsive pictures, what was changed and what was **not** done) and `docs/release/mobile-performance-report.md` has the measured results (desktop and phone separately) and what could not be tested (no real device, no Safari, no Firefox). The phone checks are in `tools/audit/mobile/`. Two things from the brief that the code does not do, on purpose: the Lab has **five** experiences (Generative Objects was deleted by the owner on 2026-11-01), and the hidden NFSU2 screen has **no iframe** (the other site refuses framing and this one never tries to get around that).

## The hero ("Velocity Field")

`src/components/hero/`. An abstract, generative field of light that the visitor moves: streaks rush out of a vanishing point, curved trails wind through it, dust parts around the cursor and a wireframe floor and ceiling rise and roll. There is no car and no scripted scene: the cursor, clicks and scroll change the picture. Headline, description and both buttons are plain HTML above the scene, so they read and work from the first paint. Strings are in `hero.*` of the dictionaries; the first button scrolls to the Selected work section of the same page (`#work`), the second opens `/contact`.

| File | Role |
| --- | --- |
| `VelocityHero.tsx`, `.module.scss` | The section: layers, scrim, layout, mode decision (scene or fallback), quality tier, watchdog callbacks, the bridge to the next section. |
| `KineticTypography.tsx` | The headline as masked, layered, moving type. Real words in the DOM; CSS-only motion driven by the CSS variables below. |
| `CursorController.ts` | Pure. Turns the pointer into an eased position, a velocity (direction and speed), an `energy` that drains away at rest, and a ring of click waves. |
| `ScrollTransition.ts` | Pure. Eases the scroll position and maps it to a pose (roll, pitch, focal-point shift, speed, brightness). |
| `HeroDriver.ts`, `useHeroDriver.ts` | The only code that touches the page: passive pointer, scroll and visibility listeners, one small loop that sleeps when everything has settled, CSS variables for the typography and fallback. Never calls `preventDefault`. |
| `VelocityHeroScene.tsx` | The R3F canvas and the master clock (`Runtime`): writes a handful of uniforms per frame, eases the theme palette, runs the frame-rate watchdog, reports context loss. Lazy-loaded: Three.js is its own chunk. |
| `VelocityField`, `LightTrails`, `DistortionField`, `ReactiveParticles` | The four systems: instanced streaks, curved trail ribbons, deforming grid surfaces, dust. Built once per quality tier, freed on unmount (`usePart`). Each is one or two draw calls. |
| `FieldCamera.tsx`, `Bloom.tsx` | Camera (cursor lean, scroll roll and pitch, composition) and the optional bloom (off in every tier; development only, `?bloom=1`). |
| `framePacing.ts` | Pure: `FramePacer` (draws every Nth frame so 120/144/240 Hz screens do not cost two or three times a 60 Hz one) and the adaptive-resolution steps. |
| `threeConsole.ts` | Drops one known warning from a dependency (`THREE.Clock: This module has been deprecated`, printed by react-three-fiber 9.x's own render-loop clock since three r183) through three's `setConsoleFunction` hook; every other three message still reaches the console. Remove it when react-three-fiber moves to `THREE.Timer`. |
| `fieldShaders.ts`, `fieldGeometry.ts`, `fieldUniforms.ts` | GLSL (one shared force function: ambient swirl, cursor, click waves), geometry builders, shared uniforms and palette easing. |
| `GenerativeHeroFallback.tsx` | The same world as a generated SVG: shows while the scene loads, with no WebGL 2, on reduced motion, after a failure or context loss. |
| `velocityHeroConfig.ts` | Everything tunable: quality tiers, field size, input time constants, composition. |

**What the visitor changes**

- **Cursor:** the flow parts around the pointer and is dragged along its motion; streaks lengthen and the world speeds up with the pointer's speed; the surfaces rise under it; the headline's lines lean a few pixels and their faint outlined echo trails just behind (offsets are in `em`, capped at about 3% of the type size, and the echo only brightens with the pointer's energy; at 88 px type the echo used to slide ~26 px and the lines ~22 px, which read as a doubled, glitching headline). The effect follows `energy`, which rises at once and drains away with a 0.6 s half-life once the pointer rests. The scene never sees the raw pointer, only an eased position.
- **Click** on the hero background (not on links or buttons; on touch, a quick tap): a ring travels outwards through the field, pushing streaks, trails, dust and surfaces, and fades over 2.4 s. Up to four can overlap.
- **Scroll:** the eased scroll progress rolls and pitches the view so the lines turn, sinks the focal point towards the next section, speeds the world up and fades the light; the headline's lines part; three hairlines grow out of the hero's lower edge. Scrolling is never intercepted.
- **Touch:** dragging moves the field and scrolling speeds it up; a drag never produces a wave, a quick tap does.

**Variables** written on the hero's root element (only while motion is allowed): `--hero-cx`, `--hero-cy` (eased pointer, -1..1), `--hero-energy`, `--hero-progress` (eased scroll-out, 0..1).

- **Theme:** the scene reads the one global theme (`useTheme`) and the `--scene-*` tokens in `tokens.css`. A theme change eases colours, light levels and the additive/alpha blend; it does not restart the scene. On dark the lights add to the image; on light they are painted over it (graphite lines, red and blue strokes).
- **Layout:** CSS decides (`--hero-layout`): stacked below `lg` (text first, the scene as its own stage below it), full from `lg` up (scene behind the text, focal point to the right). The camera reads it back.
- **Quality:** `pickQuality` chooses high, medium or low from cores, memory, pointer type, width and save-data. When the frame rate cannot hold, a watchdog (two slow windows of frames) first shrinks the canvas's resolution, in steps of 25% down to half the budget, and only then drops the tier; it gives up (static fallback) if even the lowest tier is unusable. No tier uses bloom or multisampling (see Performance on every platform below).
- **Pausing:** rendering and the driver's loop stop while the hero is off screen or the tab is hidden, and resume on return.
- **Reduced motion:** the scene is not mounted, no listeners are attached, no CSS variables are written, the headline's animation is off. The generated SVG stays, still. It reacts live if the setting changes.
- **Development aids** (stripped from production): `?hero=fallback` forces the SVG, `?hero=high|medium|low` forces a tier, `?bloom=0|1` forces bloom, `?aa=0|1` forces multisampling, `window.__hero` exposes the rig, uniforms, driver, camera and renderer, and `window.__heroRenderFrame()` renders one frame for benchmarking. The intro's scene has its own slots, `window.__intro` and `window.__introRenderFrame()`, because both scenes can exist at once.
- **Assets:** none. All geometry, shaders and the SVG are generated in code; nothing is downloaded.

### Performance on every platform

What makes the scene cheap and the same everywhere, in order of how much each one saves:

- **No multisampling in any tier.** Every primitive has a soft edge made in its own shader (ribbons, streak and trail profiles, round dust, the overlay), so MSAA adds nothing you can see, but with thousands of overdrawn additive quads it multiplied the blending bandwidth by four. Measured on the intro at 2481×1052 on an integrated GPU, GPU-synchronised, one frame: **MSAA on 17.8 ms, MSAA off 0.9 ms**. It also means the canvas's context is the same for every tier, so a tier change never re-creates the canvas (that used to flash).
- **No bloom in any tier.** It needs a half-float render target and several full-screen passes, is the least portable part of a WebGL pipeline, and one NaN pixel in it blacks out the whole frame. With the bloom on (and no MSAA) the same frame cost 9.7 ms. The glow now comes from additive blending and the trail halos. `?bloom=1` still switches it on in development, and a sanitising pass guards it.
- **Frame-rate cap by display.** `FramePacer` measures the screen's frame interval and draws every frame up to ~100 Hz, every second on 120/144/165 Hz and every third on 240 Hz, always a whole multiple so the rhythm stays even. Verified live on a 151.6 Hz display: 76 frames a second drawn, exactly half.
- **Adaptive resolution before a tier drop.** Slow frames shrink the pixel ratio (×0.75, twice) first; rebuilding the scene at a lower tier is the last resort.
- **`powerPreference: 'default'`.** Forcing the discrete GPU on a hybrid laptop means copying every frame across to the integrated GPU that drives the screen.
- **One WebGL context at a time.** The hero's scene is mounted only after the intro, exit included, is gone.
- **Parallel shader compilation** (`compileAsync`) where the browser supports it, so the first frame does not compile the programs one by one.
- **No work for waves that are not there.** The click-wave loop in the shared force function is skipped unless a wave is in flight (`uWaves`).
- **Still at rest, paused when hidden.** The intro draws nothing when nothing changes; the hero stops while off screen or in a hidden tab.

Measured on the default pipeline (Intel Iris Xe, embedded Chromium, 2000×841 viewport at 1.25 DPR → 2481×1052 canvas): intro **0.94 ms** per frame, hero **0.76 ms**. Before: 13.7–25 ms for the intro, depending on the GPU's clock. Zero blank frames in 300 stress frames with random pointer state, live click waves and the exit starburst.

## The intro ("Velocity Intro")

`src/components/intro/`, texts in `intro.*` of the dictionaries. A fullscreen, interactive opening on a visitor's first visit: the same field of light as the hero, but still until it is touched. It is not a loading screen and not an animation that plays by itself. Move the pointer and the field answers; click (or tap the button) and it flies apart onto the home page that is already waiting underneath.

| File | Role |
| --- | --- |
| `VelocityIntro.tsx`, `.module.scss` | A modal `<dialog>`: the browser makes the page behind it inert, traps focus and puts it above the header. Scene, scrim, headline, entry button, language and theme controls, "don't show again". |
| `IntroProvider.tsx`, `introContext.ts`, `useIntro.ts` | The state `ready → active → exiting → completed`, held above the router so it survives navigation and language changes. Guards make the entry fire once. |
| `introPolicy.ts` | Pure: whether to show the intro, and what to remember (`localStorage`/`sessionStorage`, both guarded; blocked storage means "show"). |
| `introTransition.ts`, `useIntroExit.ts` | Pure easing, and the hook that writes one eased number (`--intro-exit`) to a CSS variable and to the scene's signal each frame. No React state per frame. |
| `IntroEntryButton.tsx` | A real `<button>`, independent of WebGL. |
| `../hero/fieldMotion.ts` | Pure: how the field moves for the hero (always flowing) and for the intro (still at rest, driven by pointer energy), and for the exit. |
| `../hero/PointerBeam.tsx` | The light beam through the pointer, stretching with speed. |
| `../hero/PointerHud.tsx` | One full-screen quad that draws the pointer's reticle, the click shock rings and the exit starburst. Hidden (not drawn) unless one of them is showing. |
| `../hero/TunnelRings.tsx` | Concentric ring gates rushing down the tunnel, in four families. One draw call. |
| `../hero/useSceneHealth.ts` | The scene-or-fallback decision, tier and watchdog, shared by hero and intro. |
| `../hero/velocityHeroConfig.ts` | `INTRO_QUALITY`: the intro's own, much denser quality profiles; `profileFor(mode, tier)` picks them. |

**Configuration** (`src/config/intro.ts`): `frequency` is `'first-visit'` (default, remembered in `localStorage` as `intro:seen`), `'every-session'` (`sessionStorage`) or `'never'`; `allowSkip` adds a "don't show again" checkbox (`localStorage` `intro:skip`) that wins over `frequency`; `exitMs` (1000) and `exitMsReduced` (320). The decision is made on every page load and in-app navigation never restarts the intro. Development only: `?intro=1` forces it, `?intro=0` hides it; production ignores the query.

**What the visitor changes**

- **Pointer:** position, direction, speed and distance all matter. The flow parts around the pointer and swirls with the direction of travel (left→right differs from right→left); faster movement means longer beams, stronger distortion and a faster world; slow, close movement shows fine dust around the pointer. Everything is eased and returns to rest gradually (energy half-life 0.6 s), and the page renders no frames at rest.
- **Entry:** a click on the background with a mouse or pen, a tap on the button, Enter or Space on the button, or Escape. The transition lasts 1000 ms: the click point becomes an impulse, the world rushes past, the field spreads towards the edges, the view widens and rolls, the light fades and a hole opens from the click point onto the page. Entry fires once; later clicks are ignored.
- **Touch:** a finger on the background (a drag, a tap) never enters, so scrolling-by-habit cannot dismiss it; the button is full width and at least 60 px tall. There is no simulated mouse.
- **Language and theme** can be changed inside the intro; texts and colours change, the scene is not restarted.
- **Reticle:** while the pointer moves (and for about a second after) a fine targeting reticle follows it: dashed rings, ticks and a gapped cross that swell with speed and burn brightest on the side the pointer is travelling towards.
- **Shock rings:** a click sends a bright ring and three echoes outwards, broken into dashes with short spokes riding the front, on the same front that pushes the field.
- **Exit starburst:** fine spokes in three densities radiate from the click point behind a bright band and rings in its wake; the layers fly apart at different rates (hairlines fastest) for depth. Its envelope is zero at both ends, so nothing flashes.

**Detail.** The intro runs the hero's engine with several times the detail (`INTRO_QUALITY`; the hero's own profiles and look are unchanged):

| Layer | Hero, high | Intro, high | Intro, medium | Intro, low |
| --- | --- | --- | --- | --- |
| Streaks (+ hairline layer: thinner, shorter, fainter, with bright tips) | 2600 | 3000 + 9000 | 1700 + 3600 | 800 + 1500 |
| Dust (mostly 1–2 px specks, few large motes) | 2000 | 9000 | 3600 | 1500 |
| Trails (main + hair-thin; halos only under the main ones) | 24 | 28 + 40 | 18 + 18 | 10 + 10 |
| Surface grid lines (every 4th strong, the rest fine) | 1× | 2× | 1.5× | 1× |
| Tunnel rings (rows per family, four families) | – | 12 | 8 | 5 |
| Overlay (reticle, shock rings, starburst) | – | yes | yes | yes |
| Pixel budget | 3.4 M | 2.8 M | 1.5 M | 0.9 M |

**Loading and failure.** Headline and button are HTML and usable from the first paint, over the generated SVG graphic. The WebGL scene fades in after its first frame. With no WebGL 2, after a failure or context loss, or on reduced motion, the SVG stays and entry still works (with a CSS-only version of the exit; on reduced motion a plain 320 ms fade, no pointer-driven motion). The home page's text and its generated graphic wait behind the intro (no input, headline animation held); its own WebGL scene is mounted only once the intro, exit included, is gone, so there is never more than one context, and fades in over the graphic. After entry the intro's canvas unmounts, its WebGL context is released and nothing keeps running.

**Layout.** Over 1440 px: a left-aligned editorial block, the field's focal point to the right. 1024–1439 and 768–1023: the same block scaled by viewport width. Below 768: headline at the top, the entry row at the bottom within thumb reach; the headline is sized by width and capped by height so the longest word ("dimenziójában.") fits at 320 px. Short landscape screens (phones held sideways) put headline and entry side by side so the button is on screen without scrolling. Dynamic viewport units (`dvh`) are used throughout.

**Type.** The headline is modest on purpose, the field is the show: about 50 px at 1440 px wide (31% of the width), 67 px at 1920, 37 px at 1024, 25 px at 390 and 21.6 px at 320; the supporting line is 14–18 px and the entry label 13–16 px. Each text block carries a soft plate in the page colour (`.copy::before`, `.entry::before`) so it stays readable over the brightest part of a busy field without dimming the field elsewhere.

**Measured** (Intel Iris Xe, embedded Chromium; see Performance on every platform above for the frame cost):

| What | Result |
| --- | --- |
| Frames rendered while at rest | 0 in 1.5 s |
| Exit transition | 1057 ms, from the entry button's centre |
| Canvases alive at once, from the first frame to the hand-off | 1 (the intro's scene is gone by ~0.9 s, the hero's appears at ~1.4 s) |
| After entry | context lost (released), geometries 0, dev slot removed |

GPU clocks on this machine drift by up to 2× between runs, and the embedded browser's `requestAnimationFrame` rate varied between 30 and 150 Hz across the session, so figures that depend on the clock are given as A/B comparisons made in one call, and live frame pacing on slower or 60 Hz hardware is unconfirmed.

**Pixel budget fix.** `PixelBudget` lowers the canvas's pixel ratio on big screens, but React Three Fiber puts its own `dpr` prop back whenever the canvas's parent re-renders (for example when the intro goes from `ready` to `active`), which silently undid the budget. It now re-applies itself whenever the ratio has drifted, not only when the size changes.

**Flicker and glitches (found by testing in Chromium).** Four causes, each fixed and each guarded:

| Cause | Symptom | Fix |
| --- | --- | --- |
| `pow()` of a number that had rounded to a hair below zero (an interpolated 0..1 varying at a quad's edge; `pow(x, 2.0)` in the exit starburst). Undefined in GLSL: NaN on most GPUs. | About 13% of frames came out completely black in a test run (8 of 60), 0 after the fix. | Every base is clamped non-negative; `fieldShaderSafety.test.ts` fails if a `pow()` base is not provably non-negative, if `smoothstep` edges are reversed, or if `atan` is called outside its guarded helper. |
| One NaN or overflowed pixel in the bloom's half-float target, which the blur spreads over the whole frame. | A black frame for as long as the bad pixel lasts. | The bloom is off by default now; where it is switched on (`?bloom=1`), `Bloom.tsx` has a sanitising pass before it: NaN or overflow becomes 0, everything else is capped at 32. Tested by putting NaN in every hairline pixel: the frame stays lit. |
| Raw GL lines (the surface grid, the tunnel rings) are one aliased device pixel wide. | Thin, dense, moving lines crawl and twinkle, worst on a 1× display. | Lines are drawn as screen-space ribbons of 1.1 CSS px with a smooth edge (`createRibbonGeometry`, `RIBBON` in `fieldShaders.ts`). Their total light is steady to about 0.1% between tiny steps, like the smooth trails. |
| Streaks, trails and dust thinner than a pixel crossing the pixel grid. | Twinkling. | The detailed intro never draws them thinner than 1.1 px (dust: 1.8 px) and dims them in proportion, so the light is the same but steady. |
| `html:has(dialog[open]) { overflow: hidden }` removed the classic scrollbar (Windows Chromium), so the page behind the intro was 16 px wider while it was open and snapped narrower when it closed. | The whole hero reflowed at the moment of the hand-off. | `scrollbar-gutter: stable` on `html` (also fixes the mobile menu). Verified by forcing a 17 px scrollbar: the page is 1238 px wide before, during and after. |

Layout was measured in the DOM (headline word extents, button box, overlaps, horizontal overflow) at 1920×1080, 1440×900, 1024×768, 768×1024, 390×844, 360×800, 320×640, 844×390, 667×375, 568×320 and 1440×480, in all three languages where noted: no horizontal overflow, the headline always inside the viewport, the button at least 44×44 px and visible without scrolling.

**Not tested** (be aware): real phones and real touch hardware (touch was checked by emulating the viewport and dispatching `pointerType: 'touch'` events), Safari and Firefox (only an embedded Chromium was available), screen readers, genuinely slow devices (the quality tiers and watchdog are the same as the hero's), and a browser that really lacks WebGL (the fallback was forced with `?hero=fallback`). Reduced motion was simulated by overriding `matchMedia` in the page, so the CSS-side `@media (prefers-reduced-motion)` rule (it only switches the text's rise-in animation off) was not exercised.

## The home page

`src/pages/HomePage.tsx` stacks the hero and seven bands from `src/components/home/`, in this order. Each has its own composition; nothing is a card grid of equals.

| # | Band (anchor) | Composition | What the pointer does |
| --- | --- | --- | --- |
| 0 | Hero | The Velocity Field scene behind the headline "Digitális élmények. Valódi hatással." and two buttons (`#work`, `/contact`). | The hero's own cursor, click and scroll reactions. |
| 01 | Choose your path (`#path`) | Two doors of different width, height and temperature: a narrow paper one for careers, a wide carbon one for clients. Each is dark or light whatever the page is. | A blueprint grid and crosshair under the pointer on the career door; a red streak that leans after the pointer on the client door. |
| 02 | Selected work (`#work`) | Four projects, uneven: a large lead, a lower second card, a compact third, a wide fourth. | The picture tilts and its three drawing layers slide against each other. Text never moves. |
| 03 | What I build (`#build`) | Four blocks of different shape and tint, each with a drawing of its own. | Websites fan out, the application's flow runs, the phone is tapped, the integrations pass data. |
| 04 | About (`#about`) | One statement, three words in outline, the owner's sentence, the tools this site is built with. | A red spotlight lights the letters of the word under the pointer. |
| 05 | The Lab (`#lab`) | Three saturated tiles (carbon, Racing Red, deep cobalt), the same in either theme, each a link to its experiment, and a button into the Lab. | Dots swell and turn red, shapes melt into each other, type stretches towards the pointer. |
| 06 | Ways to work together (`#services`) | Build is the large dark card, Launch and Grow flank it, Care is a wider card. | A faint red wash under the pointer. |
| 07 | Closing call to action (`#start`) | "VALÓSÍTSUK MEG." at display size on Racing Red, black type and a black button. | The fan of lines behind it leans. |

**Dark and light rhythm.** `Section` gives a band its own `data-theme`: `base` (the page's), `inverse` (the other one), or fixed `dark`/`light`. From the first band on, every band is the opposite of the one above it in both themes, and the last is Racing Red; `home/rhythm.ts` is the one place that says so and `home.test.ts` checks it. The top edges are cut on the brand's diagonal (`slant`).

**Editing the content.** The words are in the dictionaries under `home.*` (all three languages, checked for equal keys and equal list lengths). The structure is in `src/content/`:

| File | What to edit |
| --- | --- |
| `projects.ts` | Per project: name, status (`live`, `demo`, `in-progress`, `concept`), technology tags, composition, sketch, a real screenshot (`image`), a details route (`detailPath`), a live demo address (`demoUrl`). A card links when `detailPath` or `demoUrl` is set; without a details page it says so in words. A test refuses `live` without a demo address, a demo address on a concept, and a details route that is not a registered page. |
| `offerings.ts` | The areas in "What I build". Remove one to hide its block. |
| `packages.ts` | Launch, Grow, Build, Care: their words (tagline, who it is for, the kinds of project it suits, what it can include), price (`quote` until a real figure exists; `{ kind: 'from', amount, currency }` publishes one), VAT treatment, a note under the price, a deadline range, and which is featured. The home page and the services page both read it. |
| `lab.ts` | The Lab's experiments: number, name, one-line description, status (`ready`, `in-progress`, `concept`), technology. Only a `ready` experiment has a page. |
| `about/` | The About page's story, principles, technologies and focus (see "About page" below), and "what this site is built with", which is read from this site's own `package.json`. The home page's About band no longer carries a story or a skills list of its own: a button leads to the About page. |

**Project facts, and where they came from.** The brief's descriptions were starting points, so the status and technologies were checked against the projects' own repositories next to this one: Spendly (its README calls it WALLEX; a "production-style portfolio project": Django REST, React 19, Expo, PostgreSQL, Docker), BookingHub (`Bookingsite/booking-app`: Next.js 16, React 19, TypeScript, Tailwind; demo credentials and browser-local storage), Logistics Platform (`Logextic`: "a portfolio / demo project, not used in production"; FastAPI, React 19, PostgreSQL, React Native, Docker). None says it is live, so they carry the new `demo` status ("Demóprojekt"), not `live`. No repository for Hollandia Kezdőknek was found, so it stays on the most cautious status (`concept`) with no technology tags until you set them. These mappings are my reading of the folder names: confirm them.

**Pictures.** A project without a screenshot shows a generated concept sketch (line-and-block drawings with no words or numbers in them), captioned "Koncepcióvázlat" so it cannot pass for a screenshot. Real screenshots exist in `Spendly/docs/screenshots` and `Logextic/docs/screenshots`, but they show the names WALLEX and Logextic, so they were not copied: put one in `public/` and set `image` once the names are decided.

**Calls to action.** Every route link goes to a registered page (`/contact`) and every in-page link to a band that exists (`#work`); `home.test.ts` reads the sources and fails on anything else. The package buttons are the exception: they open the quote request on the services page with that package chosen (`/services?package=build#quote`). The home page's client door opens the contact form with a web project chosen (`/contact?for=clients`). The other calls to action go to `/contact`, which is the contact page now; the closing band shows a `mailto:` link as soon as `contact.email` is set in `config/site.ts`. Work is still the translated "coming soon" page; the Lab is built (see "The Lab").

**Interaction rules.** Only a mouse or pen drives the pointer effects (`usePointerField` writes `--mx --my --px --py` on the element, one write per frame); a finger never does, so touch sees every composition at rest with all text, status and tags on screen. Reduced motion switches the pointer effects, the entrance (`Reveal`) and the glide of in-page jumps off. Content that is already on screen is never hidden for an entrance.

**Verified** (embedded Chromium; desktop and emulated phone sizes): no horizontal overflow at 1920, 1440, 1024, 768, 390, 360 and 320 px; no text spilling out of its box or cut by a clipping parent in Hungarian at 320 to 1920 px, in Dutch (the longest text) at 320 to 1920 px and in English at 320 to 1440 px (the first pass of that check missed clipped text, and the strict one then found four real problems, all fixed: a category badge wider than its card, a title wider than its column, a squeezed Care card, a Dutch word breaking mid-word); both themes; the intro followed by the page, with one canvas; the keyboard order (nine real links, no focusable hidden link) and visible focus rings in the light door and on the red band; the `#work` jump and the `/contact` link; hover depth on cards, doors and lab tiles; the production build (no development notes, no console output). The suite is 404 tests; the new ones cover content, tones, contrast, link targets and the pointer maths.

**Not verified.** Safari and Firefox; real phones and touch hardware; screen readers; the `prefers-reduced-motion` CSS (the script side was reasoned, not run, because the embedded browser cannot emulate the setting); forced-colours mode (rules are written, not seen); slow or 60 Hz hardware for the new sections.

## The Lab

An experimental digital playground: **exactly five interactive experiences**, a redesigned overview page, a hidden racing experience that opens somebody else's website, and the visitor's own saved work. Everything in it is real: nothing is a placeholder dressed as a demo, and an experiment that is not ready has no page and no demo (its entry in `content/lab.ts` says so with its status).

**What was removed.** Twice on the owner's orders. First (the brief asked for six and nothing else): Model Studio, Track Architect, Performance Lab, the Racing Experience as a card, and the two experiences added after them (the Generative Art Engine and the Sound Reactive World), together with the Lab's 3D "four zones" home, the experience points and achievements, and every model they exclusively owned. Then, on 2026-11-01, **Generative Objects**: the whole experience (its Quick builder, its AI creation with the Meshy adapter, the prompt writer, voice input and viewer), its server (`server/ai3d/`, the `npm run ai3d` script and the Vite plugin that served it), its dependency (`@anthropic-ai/sdk`), its settings file (`.env.example`), its four pictures, its place on the overview (the featured block and the large tile) and the `creation` kind of saved work. It is in git history (the commit before its removal is `9275457`). Shared code was checked before it was deleted and what the five still use stayed: the graphics core, the saved-works store (now of two kinds: `typography`, `material`), the handoff slot and the local storage helpers. The frame, stage, orbit camera, studio environment, small store and frame context that only the removed experience used (`experience/ExperienceFrame.tsx`, `ExperienceStage.tsx`, `orbit.ts`, `environment.ts`, `store.ts`, `context.ts` and the frame's and stage's styles) went too, on the owner's say-so; `experience/` keeps the handoff slot, the local storage helpers, the small interface pieces and `useMedia`.

### Routes and navigation

| Path | What |
| --- | --- |
| `/:lang/lab` | The overview (below). Keeps the site's own header. |
| `/:lang/lab/<id>` | One experiment: `particle-universe`, `liquid-matter`, `type-in-motion`, `infinite-space`, `chromatic-distortion`. It replaces the site header and footer with the Lab's own navigation (leave for the portfolio, all experiments, previous, next) and carries the language and theme switches. |

There is no route for the racing experience: it is a layer on `/lab` (below). All of it is real routes, so Back and Forward, a new tab and a shared address work.

### How it is built

- **One list drives everything.** `src/content/lab.ts` lists the five; the routes (`routes/pages.ts`), the dock, the previous/next links, the document titles, the overview and the home page's teaser are all derived from it. Words are `tri(hu, en, nl)` triples, so a missing translation fails the build. The experiments' names and the line "MOVE. DISTORT. EXPLORE." stay in English.
- **Page first, scene second.** Each page is plain DOM that loads first; Three.js, the shaders and the scene are further chunks. The overview uses only 2D canvases (no WebGL), so the way into the experiments never waits for a GPU.
- **`components/lab/core/`** is the shared graphics core: one react-three-fiber canvas with a pixel budget, a frame cap, a frame-rate watchdog, context-loss handling and a shader warm-up; the stage (input, still picture, error boundary, pausing off screen and in a hidden tab); one eased pointer/finger/keyboard signal; the live/calm/still views; the quality tiers; `useStageCapture` (a picture drawn again inside a frame, so it is never blank).
- **No React re-render from the pointer, ever.** The pointer, the clock, the palette and each experiment's controls are plain mutable objects the scene reads every frame.
- **The scenes allocate nothing per frame** and release what they own (geometry, materials, textures and render targets are disposed when a scene goes).

### The overview (`/lab`, `components/lab/page/`)

1. **Hero**: carbon black with Racing Red, a field of speed lines (a 2D canvas that leans to the pointer and quickens near it), the headline "ENTER THE EXPERIMENTAL SIDE." (Hungarian "LÉPJ BE A KÍSÉRLETI DIGITÁLIS VILÁGBA.") in letters that stretch and lift towards a mouse (a finger sees it still), the line "Five interactive environments. Endless possibilities. One digital playground." and the way in (`START WITH THE FIRST`, the five experiences). Plain markup: nothing here waits for WebGL.
2. **Discovery**: not five equal cards. The first is large; each of the other four has its own size, its own accent and a live miniature that answers a mouse, a pen or a finger (particles that flee or gather, metaballs that follow, letters that stretch, a tunnel that quickens, red/green/blue that pull apart). The miniatures are small 2D canvases that draw only while on screen and in a visible tab (a single still picture, redrawn only when touched, under reduced motion).
3. **Why a Lab** (six principles), **the visitor's saved works** (below), and the closing band "THE ONLY LIMIT IS WHAT YOU CAN IMAGINE." with `START EXPERIMENTING`.

### The five experiences

| | Experience | What is real |
| --- | --- | --- |
| 01 | Particle Universe | Up to 36,000 particles (tier-scaled; a density slider scales it) simulated on the CPU in typed arrays: springs to a shape (sphere, ring, wave, spiral, a mark), a pointer force that attracts or repels, a flow-field grid the pointer stirs like a fluid, a click burst the structure re-forms from. Controls: shape, attract/repel, **force**, **speed** (the simulation's clock), density, intensity, **five colour palettes**, burst, **randomise**, reset, save image (PNG). |
| 02 | Liquid Matter | A sphere displaced in the vertex shader by noise, the pointer's dent and a travelling wave per click. Four states of matter are one shading model (mirror chrome, soft clay, glass that refracts the studio into three colours, glowing lava). Controls: state, deformation, flow, **colour** (recolours the light the surface gives back, keeping its shadows and glints), light, pulse, **random material**, reset; PNG and keeping the work. |
| 03 | Type in Motion | **Any words** (up to 36 letters, set one word to a line, at most four lines, made safe to set: capitals, no markup or control characters) in four typefaces (wide, condensed, serif, mono), set into a glyph texture, cut into one quad per letter and stacked into layers for real 3D extrusion. Each letter is a spring-driven body that tilts and lifts near the pointer. Controls: text, three ready-made sentences, typeface, **size**, **letter colour**, **six motion presets** (still, drift, wave, pulse, orbit, glitch), **animation speed**, extrusion depth, distortion, break apart, scatter, random style, reset; PNG and keeping the work. |
| 04 | Infinite Space | A tunnel of light streaks, planes, rings and dust positioned in the vertex shader from a wrapped depth. The pointer turns the camera; its speed stretches the streaks and widens the lens; a click sends a pulse. Controls: own drift, **movement intensity**, **pattern** (all, streaks, rings, planes), **palette**, streak length, pulse, **warp jump**, reset, save image. |
| 05 | Chromatic Distortion | One full-screen fragment shader: signed-distance forms evaluated three times, once per colour channel, at different offsets. Controls: channel separation, background waves, lens, **direction of the colour displacement**, **glitch**, **noise**, surge, **randomise**, reset, **screenshot (PNG)**. The glitch only slips horizontal slices sideways, at most three changes a second, and nothing flashes; it is off under reduced motion. |

### The hidden racing experience (`components/lab/easter/`)

Not in the navigation, not in the list, not a seventh card. It leads to **https://nfsu2.xyz/**, somebody else's website, and it **never opens it by itself**: after a short transition the visitor is offered OPEN NFSU2 (a new tab) or the way back.

- **The transition (the loading state)**: a Racing Red wipe with speed lines covers the screen, says "ENTERING THE PIT LANE" and (small) that nfsu2.xyz is an external website; 1.25 s later (0.3 s under reduced motion, where it is a plain red screen) the choices appear. It is a modal dialog while it is up: the page behind does not scroll, the focus is on it, Tab goes round its own controls. **Escape closes it** at any moment and returns the focus to where it was.
- **The screen after it** ("NFSU2 runs on its own website"): it says plainly that the site cannot be shown inside this page (it does not allow it, and this website does not try to get around that), and offers two 48 px-tall choices in carbon on the red: **OPEN NFSU2** (a link, `target="_blank" rel="noopener noreferrer"`: a new tab, no `Referer`, no handle on this page) and **Back to the Lab**. The focus goes to OPEN NFSU2. Nothing leaves this page until the visitor chooses it. It fits a 320 px phone and a 568 px-tall landscape phone (the content scrolls inside the layer if it ever has to).
- **No frame, and why.** The brief for the final integration (PROMPT 15) asked for a fullscreen frame attempt with a fallback, and for the site not to be bypassed if it refuses. nfsu2.xyz answers `x-frame-options: DENY` and a `content-security-policy` with `frame-src 'none'; frame-ancestors 'none'` (read with `curl -I` on 2026-11-01 and again on 2026-11-05), and this site's own policy says `frame-src 'none'`. A frame could only ever show the browser's "refused to connect" page, so none is built, the policy is not loosened for it, and the fallback screen *is* the designed result, not an error path. This site never reads, scripts or proxies the other page and never requests anything from it (the end-to-end journey E checks that, tools/e2e).
- **History.** The first version had a fallback screen and a sandboxed frame path; both were removed when the owner asked for a direct transfer (the tab went to nfsu2.xyz straight after the transition, `leaveFor`). PROMPT 15 reinstated the fallback screen and the OPEN NFSU2 action; the direct transfer (and its `pageshow` handler) is gone again. If the owner prefers the direct transfer back, it is the `leaveFor` function and a timer in `RacingEgg.tsx`, in git history (commit before this change).
- **Finding it**: the full stop at the end of the Lab headline is a red button that pulses faster than anything else (13–19 px wide and 33–46 px tall depending on the screen: an inline target, which WCAG 2.5.8 exempts; the keyboard route below is the alternative); or type N F S U 2 on the Lab page (ignored while typing in a field or with a shortcut key held). A small hint at the end of "Why a Lab?" says one red dot is faster than the rest.

### Saved works (`components/lab/artifacts/`)

The visitor's work, in IndexedDB (a memory store, announced as such, where the browser has none): typography artworks (the words, typeface, size, colour, motion, speed, depth, distortion, broken or not) and material presets (state, deformation, flow, light, colour). No account, no server. Each has a picture, can be renamed, opened in its experiment (the settings travel through a one-slot handoff, read without being emptied and emptied by the page in an effect), downloaded as JSON (and PNG), and deleted after a confirmation. Every reader clamps numbers, drops unknown fields and refuses what it does not know; version 1 typography works (one of three sentences) and material presets (no colour) still open. A browser that kept 3D creations from the removed experience still holds them in IndexedDB; the store no longer lists or opens them (a work of an unknown kind is dropped when it is read).

### Quality, performance and the fallbacks

- **Three views** (the Display switch): *Live*, *Calm* (the default under `prefers-reduced-motion`: smaller motion, nothing moves by itself, the canvas draws only while something changes, and every control still works) and *Still* (no WebGL: a picture and the page's text).
- **Adaptive:** the first tier comes from the device and the frame-time watchdog corrects it (resolution first, then the tier; at the lowest tier a scene that cannot hold a frame rate gives way to the still view with a button to try again). Shadows are off on the lowest tier. When the stage restarts after a tier change, its api is waited for, so a click on *Save* or *GLB* in that moment is not lost.
- **Fallbacks:** no WebGL 2 → the still view with a notice; a scene that throws or a chunk that does not load → the still picture or a way back; a lost context → a notice and automatic restore.
- **Development switches** (ignored in production): `?lab=still|high|medium|low`.

### Accessibility

Real links and native inputs throughout; every control has a visible label; the stage is a focusable group (arrow keys and + − move the camera); focus is visible; the canvas is never the only source of information (Type in Motion gives its sentence as text); live regions announce a save and an export; the hero headline has one accessible name and its decorative letters are hidden; dialogs trap focus and close with Escape; touch targets are at least 44 px on coarse pointers.

### Tests and checks

**Automated** (`npx vitest run`: 852 tests in 39 files, all passing; `tsc -b`, `oxlint` and `npm run build` are clean; the production bundle was searched for the removed experience's words and for any engine or key name: none): the saved-work readers (round trips, damage, clamping, refusal of what they do not know); the type text helpers and motion presets (bounded, finite, the glitch at most three changes a second); the particle, liquid, space and chromatic controls; the hidden experience (the destination, the transition's length, the link it leaves through, the keyboard sequence, the words); the Lab's list (exactly five, in order, the removed ones nowhere), the routes and the three languages of every text.

**In Chrome** (Playwright with the system Chrome, headless, on software WebGL and on this PC's graphics card): the new controls of the five experiences, each saving a non-blank picture; the rest of the portfolio again after this removal (every page in three languages with no console output, the header, Back, the language switch on the overview and on an experiment, the theme switch, the overview offering exactly five ways in, each of the five opening with its title and a canvas, the dock walking 05 to 01, **the seven removed addresses, `generative-objects` among them, now the 404 page**, no failed request); a layout matrix of 11 sizes (1920×1080, 1440×900, 1366×768, 1024×768, 768×1024, 430×932, 390×844, 360×800, 320×568, and 844×390 and 932×430 lying down) for the overview in three languages and both themes (66 states: horizontal overflow, clipped text, a word cut in two, overlapping regions and small targets, all clean); the hidden experience (21 checks: the transition and its words in three languages, no buttons or links in it, the whole tab going to the real nfsu2.xyz after about 1.2 s with no referrer, Back returning to the Lab with the page scrolling again and the dot working a second time, Escape staying and returning the focus, the keyboard sequence, a field ignoring it, reduced motion, 390×844, 320×568, 844×390 and 768×1024; run before this removal and untouched by it).

**Found by these checks and fixed:** Escape did not close the hidden layer during its transition (the focus was outside it): it listens on the document and takes the focus from the first moment; the red full stop was far smaller than a finger: it has an invisible 44 px hit area; a mouse click on a button laid over a 3D stage never arrived (the camera controller captured the pointer): it now ignores presses that start on a button, link or field.

**Not verified** (be aware): real phones and tablets and real touch hardware (touch was emulated, taps were synthetic); frame rates on real devices (the checks ran in headless Chrome on a desktop PC, on its graphics card or on software WebGL); Safari and Firefox; a screen reader; any physical device. Under software rendering the Lab's frame-rate watchdog now and then swaps the stage for "The live view stopped"; that is the watchdog doing its job, and the browser scripts press Try again as a visitor would.

## Project pages

> **Since PROMPT 13.1 the portfolio is managed from the administration** (`/admin/projects`, [`docs/cms/README.md`](docs/cms/README.md)): the Work page (`/<lang>/work/`), every project's page (`/<lang>/work/<slug>/`) and Selected work on the home page are drawn from the same data, which the backend serves (`GET /api/projects`) and the owner edits. The four projects described below are what the website **ships with**: they are loaded into an empty database at the first start, and they are what the site shows when no backend answers. With a backend, its answer is the truth: an unpublished project is not brought back from this folder's copy.

`/hu/work/spendly`, `/hu/work/bookinghub` and `/hu/work/logistics-platform` (and the same under `/en/` and `/nl/`) are written from the projects' own repositories next to this one, not from the brief. Hollandia Kezdőknek has no page: no repository for it was found, so its card on the home page says "the details page is not ready yet" and links nowhere, and the previous/next links skip it.

**Every page has the same eight bands, in the same order** (overview, the challenge, the approach, technical architecture, key features, design decisions, lessons and next steps, gallery), alternating dark and light like the home page; a band with nothing behind it is left out. What differs is each project's identity: its accent (Spendly red, BookingHub cobalt, Logistics ink), its hero composition (a tilted screenshot bleeding off the right, a wide screenshot under the name, a smaller one floating over a route) and a backdrop drawn from the subject (rising bars, a month grid, a route with stops). The picture leans towards a mouse, as on the home page; a finger never moves it.

**What a page says, and how it is kept honest**

- Features are *built*, *partly working* or *planned*, told apart by an outline and a word, not by colour. A part of the architecture or a connection that is only a plan is dashed and says so; every part appears in at least one connection (a test), and the connections are also written out as the diagram's text version.
- Each challenge names where it is documented in the project (for example `docs/code-review.md · H1`). Only problems that the repositories document are shown, with the fix they document.
- A list of what the project does not do comes from its own limitations or its code. "What I learned" is empty on purpose: it is the owner's to write (a test asserts it is empty, so adding some is a deliberate edit). The role line says "a single-author project", which is what the git history of each repository shows (one author in all of them).
- Spendly is called WALLEX in its repository and screenshots (Spendly was its earlier name); the page says so. The Logistics Platform is called Logextic there.
- Tests refuse invented figures (10K+, 99.9 %, ratings), demo credentials, key-like strings, a `live` project without an address and a demo link on a concept.

**Where the facts came from, and where the code disagrees with a README.** Spendly and the Logistics Platform: their READMEs and `docs/` (code review, design system, architecture, known limitations), checked against the code's structure; their test suites were not re-run. BookingHub: its code and git history, because its README overstates: it says "Next.js 15" (it is 16), says the theme follows the system setting (it only remembers a toggle), lists an `/api/test` route (there is none) and calls the sign-in secure (it is a fixed demo account checked in the browser). BookingHub's pictures are screenshots of a *copy* of the running app (with no e-mail key, so nothing could be sent), and its landing page is left out on purpose: its "10K+ users, 99.9 % uptime, 4.9/5" are placeholder marketing text.

**Editing.** Change a page in `content/projectDetails/<name>.ts`: every text is a `tri(hu, en, nl)`, so a missing translation does not compile. To publish a project, add its file, register it in `projectDetails/index.ts` and `meta.ts`, and give the project in `content/projects.ts` a `detailPath` (`/work/<slug>`); the route, the previous/next links, the language switch and the title all follow. A real screenshot goes in `public/projects/<slug>/` as WebP; `projectDetails.test.ts` reads each file's header and fails if its size differs from what the data says or if it is over 300 KB (a gallery over 1 MB fails too). Open Graph tags are written by script per page and language (`routes/documentMeta.ts`); a crawler that does not run scripts sees only the site-wide tags in `index.html`.

**Verified** (Chrome driven by Playwright against the dev server and the production build, plus the embedded browser): no horizontal overflow, text spilling or clipping on any of the three pages in Hungarian, English and Dutch at 320, 360, 390, 768, 1024, 1120, 1440 and 1920 px, in both themes (it found and fixed one: a Dutch heading wider than a 320 px screen); the lightbox by keyboard (Enter, arrows, Escape, focus returns to the thumbnail) and by tap and click outside; every control in the page has an accessible name and stays in the tab order; previous/next, back to the portfolio and the language switch keep the project and its page (the intro does not return); Work stays current in the header on a project page; reduced motion (nothing hidden for an entrance, no pointer tilt, no transitions, no gliding jumps); a touch screen; the pictures blocked (text intact, no script error); no WebGL on these pages; the production build (deep links, all pictures load with alt text, no failed request, no development notes). 472 tests.

**Not verified.** Safari, Firefox, real phones and a screen reader; that the projects' claims are *true* beyond what their documentation and code structure show (their tests and apps were not run, except BookingHub's app, whose screens were opened); forced-colours mode (written, not seen).

## Shop

The services page grew into a small shop for services (PROMPT 09, "Premium Shop 2.0"). It sells nothing by itself: **the checkout is an inquiry**. There is no payment provider and no price anywhere, because none has been approved; every package, service and add-on reads "Custom Quote" (`Egyedi ajánlat`, `Offerte op maat`), and the cart is the way to put an inquiry together.

### Pages

| Address | Page |
| --- | --- |
| `/hu/services`, `/en/services`, `/nl/services` | **The front page.** A hero ("BUILD SOMETHING THAT MATTERS." / "ALKOSSUNK VALAMI MARADANDÓT." / the Dutch line, two buttons, and the four services as tiles that are also links), **discovery** (`#services`: the four services as cards, one search over services, packages and add-ons with a filter by type, "clear all filters" and an empty state), **the tier comparison of the four packages** (`#packages`), **FULL EXPERIENCE** (`#full-experience`), **a way into the request builder** (`#configure`), **process, what happens after an inquiry, how we communicate** (`#process`), **support options** (`#support`), **real work** (`#work`), **the questions** (`#faq`) and the closing call (`#start`). The bands alternate dark and light and the last one is Racing Red (`components/shop/rhythm.ts`, checked by `shop.test.ts`). |
| `/services/website`, `/webapp`, `/ui`, `/integrations` | **A product page per service**, with the eleven sections of the brief in order: hero, overview, what you get, key features, who it is for, how it works, available add-ons, related projects, questions, pricing or custom quote, closing call. On a phone a sticky "Request a quote" bar follows (see below). |
| `/services/configure` | **The request builder**: six steps (need, package, extras, details, review, request). |
| `/services/cart` | **The cart.** |
| `/services/packages/launch`, `grow`, `build`, `care` | **A page per package** (Shop 3.0): who it is for, what is included, the detailed features, what makes the tier different (what it adds over the package below it), the add-ons that apply, related services, "Custom quote", questions. |
| `/services/full-experience`, `/services/full-experience/start` | **FULL EXPERIENCE** (Shop 3.0): a separate flagship offer, "YOUR IDEA. BUILT FROM ZERO.", and its eight-step configurator. A custom quote, never a package with a price. |

All are separate chunks (`App.tsx`); none loads Three.js or any 3D code, and none opens with the intro (`shouldShowIntro` skips it for any address under `/services`, without using it up: the next visit to the home page still shows it).

### What is edited where

| What | Where |
| --- | --- |
| The four packages: words, price, VAT, deadline, what they suit, main deliverables, scope, customisation, support, which add-ons they allow | `src/content/packages.ts` (also read by the home page) |
| The four services: name, summary, what they can include, an example | `src/content/services/areas.ts` |
| Each service's product page: promise, overview, benefits, typical projects, what you get, who it is for, the note in "how it works", packages first offered, related projects, its own questions | `src/content/services/detail.ts` |
| The add-ons: name, summary, which needs they apply to, price | `src/content/services/addons.ts` |
| The five steps, what happens after an inquiry, communication and collaboration | `src/content/services/process.ts` |
| The questions (shared ones are picked per service by id) | `src/content/services/faq.ts` |
| The tier comparison (tier labels, the ladder, the feature grid) and the FULL EXPERIENCE offer (copy, stages, components, configurator questions and budget ranges, FAQ) | `src/content/shop/{comparison,fullExperience}.ts` is the starting copy; once the backend is seeded (`npm run catalog:seed-export`), **Administration > Package comparison / FULL EXPERIENCE** is the master |
| All interface words (labels, validation messages, cart and confirmation texts) | `src/content/shop/*.ts`, three languages side by side (`tri(hu, en, nl)`); a missing translation is a build error |
| Where the inquiry is sent, and whether the acknowledgement box is required | `src/config/quote.ts` (`VITE_QUOTE_ENDPOINT`) |
| The privacy notice's page, the e-mail address | `src/config/site.ts` (`legal`, `contact.email`) |

**Prices are configuration.** To publish one, in `packages.ts` (or `addons.ts`):

```ts
price: { kind: 'from', amount: 1200, currency: 'EUR' },   // 'EUR' or 'HUF'
vat: 'excluded',                                          // 'excluded' | 'included' | 'exempt'
quoteRequired: true,                                      // keeps "the exact amount is given in the quote"
timeline: { kind: 'estimate', min: 2, max: 4, unit: 'weeks' }, // optional; shown as an estimate the quote confirms
```

The cart then tells the parts apart without any other change: a line whose package has a published price is a **fixed-price product** (its own group, a cobalt edge and label, its amount in the summary, totals per currency with the VAT wording or "mixed"), every other line is a **custom-quoted service**, and an add-on is labelled **add-on**. A test (`shop.test.ts`, "what the cart is worth") exercises that with invented prices that are not in the shipped content. Another reads every text of the shop in three languages and refuses a currency amount, a percentage, a stated length of time, "guarantee", "unlimited", superlatives, "testimonial" and "most popular".

### The tier comparison, the package pages and FULL EXPERIENCE (Shop 3.0)

PROMPT 09.1 replaced the old package selector and compare dialog with a **four-column tier comparison** (Launch, Grow, Build, Care): a table from 48 rem, and below that a phone switcher of its own (tabs, a swipe, expandable feature groups, and two packages side by side where the screen has room), not the table squeezed. For every feature and package the grid says `included`, `add-on`, `custom service` or `not included`; what each tier adds over the one below, what is in every package and what is introduced with which tier are **worked out from that grid**, so they cannot disagree with it. Every package has a page of its own, and **FULL EXPERIENCE** is a separate flagship offer with its own configurator, saved through the same quote-request endpoint and visible in the administration with its answers. The comparison and the offer are edited in the administration (drafts and an explicit publish), and the website lays the published copy over its own text.

Everything about it, including the data model, the endpoints, the checks and the decisions the owner still has to make, is in **[`docs/shop/README.md`](docs/shop/README.md)**.

### The request builder

Six steps, one question group per screen on a phone: **need** (new website, web application, existing website improvement, UI implementation, API integration, not sure yet; several may be chosen), **package** (Launch, Grow, Build, Care or a custom project, per service, with the packages that suit a service marked "suggested"), **extras** (only the add-ons that apply to the chosen service), **details** (the description is the only required question; main goal, existing site, timing and requirements are optional), **review** (every selection with a way to change it, "add another service") and **request** (name, e-mail, optional phone, acknowledgement). A progress line and bar (steps listed from 48 rem) and Back/Next are always there; the finished steps are buttons. The choices are the cart's: they survive going back, another page, a reload and a language change. The answers (description, name, e-mail…) live in memory only (`inquiryStore.ts`): no storage, no cookie, nothing in the address bar. A step is checked when the visitor moves on; the first wrong answer takes focus and every message is a sentence with an icon tied to its field. Back and Next sit at the end of each step, in the flow of the card (on a narrow phone Back is the arrow alone, so Next has room for its words); they are deliberately not stuck to the screen, because a fixed bar sits on top of the fields it belongs to (the layout matrix found exactly that).

**Sending is the one place that decides what is true** (`src/forms/submit.ts`, shared with the contact form):

- With no endpoint configured (today's state), the builder says so before the first question, and its last step offers the summary to copy (and, once `contact.email` is set, to open as an e-mail draft that only leaves when the visitor sends it there). It shows no success message, ever, because nothing was sent.
- With `VITE_QUOTE_ENDPOINT` set at build time to an https address, the request is POSTed there as JSON, version 2: `{ form: 'quote', version: 2, language, items: [{ need, plan, extras }], description, objective, reference, timing, requirements, name, email, phone }` (empty answers are `null`; no cookies, no referrer). **This replaces the earlier single `projectType` / `package` / `budget` payload**; a handler written for that one has to be updated. Only a 2xx answer counts as sent; any other answer, a network failure or no answer within 12 seconds is reported as a failure, the answers and the cart stay, and the page says which. After a real success the cart and the answers are cleared and the page says what happens next. The handler must allow cross-origin POSTs from this site (CORS) and should validate and rate-limit on its side.

### The cart

The cart (`shop/cart.ts`, `cartStore.ts`) holds lines: a service (or "existing website improvement", or "not sure yet"), a package or custom project, and its add-ons; a service appears once. It is kept in this browser's `localStorage` under one key (`cc-shop-cart-v1`), read defensively and shared between tabs; it holds choices only, never a name or a message. Add a service from a card or a product page (the button then says "In your cart" with a tick and links to the cart; a screen reader is told by a live region), change its package and add-ons in place, remove it ("removed, Undo" for nine seconds), clear the cart (asks first, inline), continue browsing, or proceed to the inquiry (the builder opens on the next open question). Lines are grouped by price class. On a wide screen the summary is a sticky panel beside the lines; on a phone it is a collapsible block on top and the main action is a bar at the bottom that leaves when the footer comes into view. No payment is taken or imitated.

### Mobile

Not a scaled desktop: the header shows the cart (when it has something, and always inside the shop) beside the menu button; the mobile menu carries the four categories, packages, the builder, search (opens the search box with the cursor in it) and the cart, then the theme and language switches, all at least 44 px tall; breadcrumbs collapse to one obvious back link with an arrow; choices are 56 px cards, not small check boxes or drop-downs; the product page has a sticky "Request a quote" bar that appears only after the hero, leaves while the price band, the closing band or the footer is on screen, clears the home indicator (`env(safe-area-inset-bottom)`), is inert while hidden, and widens `scroll-padding-bottom` while shown so a focused field is never behind it.

### Motion and loading

Fast and purposeful (the shop is the `shop` motion scope, the cart and the builder the `checkout` one: see "Motion" above): the headline's words rise in about 0.25 s (0.42 s scaled by the shop's 0.6; the words are in the page from the first paint), a chosen package's stage slides in, accordions open on a grid-row transition, a ticked choice pops, the cart count nudges, a new cart line slides in, a pointer leans the hero tiles and cards a few pixels. All durations are the tokens in `tokens.css`, which collapse to nothing under `prefers-reduced-motion`; a test reads the stylesheets for it. While a page's code arrives a slim moving bar shows (`ShopFallback`) and the submit button says "Sending…". There are no photographs in the shop (the drawings are the same small SVGs as the home page), so there is nothing to size, serve responsively or lazy-load; the pages themselves are lazy chunks.

### Before launch

The owner has to decide or supply: the prices, VAT treatment and any deadline range; whether each service, package and add-on is something they will take on (the lists are starting copy built from the brief and from what the portfolio projects show, and the words about "what you get", "who it is for" and the questions are to be read and confirmed); **whether to offer a CMS integration** (the brief listed it, nothing on the portfolio shows it, so it is not offered; add an entry in `addons.ts` and to the packages that allow it); the endpoint or form service (and updating its handler to the version 2 payload); the privacy notice (its page, `legal` in `site.ts`, whether the acknowledgement box is required, and whether a note about the cart's `localStorage` belongs in it); the e-mail address; the brand name, which is still "Your Name". For Shop 3.0 also: the seeded comparison grid (a few Build-column cells are inferences), the FULL EXPERIENCE stages and components, the budget ranges (none are seeded) and a native read of the Hungarian and Dutch copy (see `docs/shop/README.md`).

### Tests and what was checked

All browser checks below are **Chrome driven by Playwright on one PC: emulated viewports and synthetic touch, not physical devices.** No physical phone or tablet, Safari, Firefox or screen reader was used.

**Unit and render tests** (`npm test`, 914 tests in 39 files at the time, 852 before this work; 982 in 44 files with the motion work): the cart's rules (one line per service, add-ons only where they apply, undo, defensive reading of a saved cart), prices with invented published prices (the shipped content has none), search in each language (accents, case, ranking, filters), the inquiry's validation, request shape and summary, the content guards (no price, percentage, duration, guarantee, superlative or testimonial in any of the three languages; the same placeholders in every language), every shop page rendered to markup in three languages (a service page ×4, each builder step, the cart with items), the page registry, document titles, the intro skip for shop addresses, the contrast of the colour pairs the shop uses in both themes, and a read of the sources and stylesheets (no storage but the cart's, no console output, no 3D import, durations that collapse under reduced motion).

**The customer journey** (23 steps, against a dev server whose endpoint is a local stand-in that can answer 200, answer 500, drop the connection or never answer): open the shop; browse the categories (search, type filter, clear all, empty state); open a service page (all eleven sections); change language (HU, NL, EN) and see the document language follow; change theme; choose a package and add-ons; add to cart (button state, badge, saved cart, the screen-reader announcement); selections survive a reload and a language change; modify the cart (package, add-ons, summary); remove, undo, clear with confirmation; back and forward in the browser; review in the builder and change an answer from the review; validation errors (message, `aria-invalid`, focus, going away once fixed, nothing sent while invalid); a real submission (the payload is checked field by field, the confirmation appears only after the 200, the cart is cleared only then); a 500 and a dropped connection (honest message, answers and cart kept, no success, a retry works); a request that never answers (the page says so after 12 s); keyboard (Space, Tab, Enter, arrow keys in a radio group, a visible focus ring, focus moves to the new step's heading); a first-time visitor on a shop address gets no intro and loads no 3D code, while the home page still shows the intro; on a phone: the menu with the shop group, search with the cursor in the box, one back link, the sticky "Request a quote" bar (hidden at the top, shown mid-page, hidden over the price band and at the footer), the whole builder by touch up to a real send, the cart (no horizontal scroll, remove and change package by touch). Result: 23 of 23 (two earlier runs lost steps to the dev server being busy and to assertions that read the old page while a lazy page was still arriving; both were fixed in the script, not in the shop).

**Responsive matrix** (552 checks: 1920×1080, 1440×900, 1366×768, 1024×768, 768×1024, 1024×1366, 430×932, 390×844, 360×800, 320×640, and landscape 844×390 and 932×430; both themes; the front page, two service pages and the cart in Hungarian, English and Dutch; the builder's six steps in English at every size and in all three languages at 1440 and at 430 px and below): **no horizontal overflow, nothing past the viewport edge, no clipped text, no text under 12 px, no touch target under 32 px.** What it found and what was done: the builder's sticky Back/Next bar sat on top of fields on phones (now in the flow of the card); link targets of 21 to 30 px (breadcrumb, card titles, project names, language switch in the menu: now 44 px); a 15 to 27 letter word broken in the middle in Hungarian and Dutch headings, buttons and cart lines (a second check that looks for words split across two lines found 86 of them; after shortening a few labels, sizing the service title and card names to their longest word, letting the cart line wrap and making Back an arrow on a narrow phone there are none at 320 and 360 px, and none were found at 390, 430 and 768 px). What it still lists is measurement noise or by design: the visually hidden skip link and links that have scrolled under the sticky header after a step change, and on a 320×640 screen the cart's mobile bar over the first line's Remove button until the page is scrolled (the bar leaves when the footer comes into view).

**Accessibility, automated:** axe-core 4.11.1 with the WCAG 2.0, 2.1 and 2.2 A and AA and best-practice rules, 76 audits (front page, service page, cart and every builder step, including the error states, in English; the first builder step in Hungarian and Dutch; both themes; 1440 and 390 px): no violations, after fixing one it found (two navigation landmarks named "Language", in the header and the footer; the footer's now has its own name). axe finds only part of the problems: it says nothing about how a screen reader sounds.

**Production build** (`vite preview`): the seven shop addresses in three languages, 21 pages: a title and description in the page's language, `og:title` equal to the title, `lang`, exactly one `h1`, no console output of any kind, no failed or 4xx request, no intro dialog, no Three.js request. Page chunks (gzip): front page 6.5 kB, service page 3.2 kB, builder 4.1 kB, cart 2.8 kB, the shop's words in three languages 14.5 kB (shared); the main bundle is 129 kB gzip.

**Speed, emulated** (4× CPU slowdown, about 1.6 Mbit/s and 150 ms latency, production build): largest contentful paint about 2.7 to 3.3 s, cumulative layout shift 0.002 to 0.062 (it was 0.14 to 0.28 until the loading placeholder was made a screen tall, so the footer no longer jumps when the page arrives), longest task 90 to 310 ms. These are numbers from one PC, not from a phone.

**An unknown address** under `/services` (for example `/services/nothing-here`) shows the site's 404 page.

**Motion:** the headline rises in about 0.25 s, a package's stage in 0.24 s; under `prefers-reduced-motion` every duration is 0.01 ms (checked in the browser, and by a test over the stylesheets).

**Not verified.** A physical phone or tablet (the sticky bars and the on-screen keyboard in particular); Safari and Firefox; a screen reader (the markup uses native radios, checkboxes, fieldsets, labels, live regions and a button-controlled region, but it was not listened to); forced-colours mode (the decorative layers are removed, not seen); a real endpoint (none exists; the stand-in is a script); the Hungarian and Dutch copy by a native reader (it was written alongside the English and has not been proofread).

## About page

`/hu/about`, `/en/about`, `/nl/about`: the statement ("Nem csak kódot írok. Digitális élményeket építek."), then four bands and a closing call to action, each reachable by its anchor: **the story** (`#story`), **how I work** (`#approach`), **the technologies** (`#skills`), **the current focus** (`#focus`) and the closing band (`#start`, Racing Red, a static composition: it does not repeat the intro). The bands alternate dark and light like the other pages (`components/about/rhythm.ts`, checked by `about.test.ts`). The hero's second line is drawn in outline and a mouse over it lights a red disc inside the letters; the speed lines behind it are the faint echo of the Velocity Field. A touch screen and "reduce motion" see them still.

**What is edited where**

| What | Where |
| --- | --- |
| The working title, the three paragraphs, the closing thought and the seven transferable skills | `src/content/about/story.ts` |
| The four principles (Understand, Design, Build, Refine) and the sentence about the loop | `src/content/about/approach.ts` |
| The technologies, their groups and (optionally) a level word for each | `src/content/about/skills.ts` |
| The current focus topics, each switched on or off with `active` | `src/content/about/focus.ts` |
| The page's labels and the hero and closing words | `aboutPage.*` in `src/i18n/locales/*.ts` |

**Honesty rules.** The story rests on two facts the owner gave: they worked in logistics and turned to IT and software development on purpose. It names no employer, no period, no result and no anecdote, and the seven skills (problem solving, seeing the whole process, organisation, client communication, teamwork, systems thinking, continuous learning) are described as ways of working, not achievements. Tests refuse a year, a number of years, a percentage, a score, a certificate, an exam, an employer's legal form and a claimed result in any language, and any e-mail address or link in the words. The technologies are shown as names only: no bar, no percentage, no years. `level` is `null` for every one, so no level appears; set `'learning'`, `'working'` or `'confident'` on a technology and the matching word ("Learning", "Working with it", "Confident with it") appears beside its name (a test expects `null` until you decide, and says so). There are no logos: they would need the makers' artwork in one consistent style, used as each allows; a test keeps the data to a name and a level. The focus lists directions, not mastery: `data` ("data-driven solutions") ships hidden because nothing in the portfolio shows it clearly; the other six are backed by the projects in `content/projectDetails/`, and the owner has the last word.

## Contact page

`/hu/contact`, `/en/contact`, `/nl/contact`: a hero ("Van egy jó ötleted?") with **two doors**, for employers and for clients, and **one form** (`#message`) that both lead to. The doors are the same pieces as the home page's two doors (`components/home/PathDoors.tsx`), with new words. A door jumps to the form and starts it on its topic (a job opportunity, a web development project) with a subject to begin from; the subject follows the topic and the language until the visitor writes their own, and is never overwritten after that. `?for=employers` and `?for=clients` in the address do the same, and the home page's client door uses it. The answers are kept in memory only, so they survive a language switch and are gone on reload. No storage, no cookie.

**The form** asks for a name, an e-mail address, what it is about (a job opportunity, collaboration, a web development project, something else), a subject, a message and, where `config/contact.ts` says so, an acknowledgement of how the data is used (linked to the privacy notice once `legal` in `site.ts` has a path). It is checked when it is sent; the first wrong answer takes focus, each message is a sentence tied to its field, and it goes away as soon as the answer is right. While sending, the button is disabled and the form is marked busy.

**Whether it really sends** is decided by one place, `src/forms/submit.ts`, the same transport as the quote request's:

- With no endpoint (today), the form says so before the first field, and its button reads "Prepare summary": it shows what would have been sent, to copy (and, once `contact.email` is set, to open as an e-mail draft that only leaves when the visitor sends it). No success message appears, because nothing was sent.
- With `VITE_CONTACT_ENDPOINT` set at build time to an https address, the message is POSTed there as JSON (`form: 'contact'`, `language`, `kind`, `name`, `email`, `subject`, `message`; no cookies, no referrer). Only a 2xx answer counts as sent; any other answer, a network failure or no answer within 12 seconds is a failure that keeps the message and says so. A double click sends once. Both forms may use the same address: every payload names its form (`'contact'` or `'quote'`).

**Links.** `src/config/links.ts` turns `site.ts` into the links the page shows: the e-mail address first (a `mailto:`), then each profile that has an address. Nothing is shown for an entry that is still `null`; in development a muted note says where to set them. A profile opens in a new tab with `rel="noopener noreferrer"` and says so to screen readers. To add a professional profile, add `{ id, label, url }` to `social` in `site.ts`; it then appears here and in the footer. No address, profile id or URL is written anywhere in the code or the words (tests read the sources and the dictionaries for it).

**Before launch** the owner has to supply: the real name (still "Your Name"), the e-mail address, the GitHub and LinkedIn addresses, any other professional profile, the endpoint that receives the messages, the privacy notice (its page, and whether the acknowledgement box is required), their confirmation of the story, the technology levels and which focus topics are current, and a photograph if one is wanted (none is shown).

**Verified** (Chrome driven by Playwright against the dev server and the production build; a local stand-in for the endpoint for the sending paths): no horizontal overflow, text spilling or clipping on the home, services, About and contact pages at 320, 360, 390, 768, 1024, 1120, 1440 and 1920 px in Hungarian, English and Dutch, in both themes (it found and fixed one: the contact doors' sentence-length titles spilled out of their doors); the doors, the form, the errors and focus, the language switch with the draft and the subject, a real POST, a 500, a double click, the deep links, reduced motion and a touch screen; the production build in all three languages (titles, descriptions, Open Graph tags, no console output, no failed request, no development notes); the configured links (checked once with example addresses set temporarily, then removed). The suite covers the About content's honesty rules, the form's validation, the transport, the links and both pages rendered in three languages.

**Not verified.** Safari and Firefox; real phones; a screen reader (the markup uses native radios, fieldsets, labels and lists, but it was not listened to); forced-colours mode (written, not seen); a real form service or backend (none exists yet); the Open Graph tags for a crawler that does not run scripts.

## Search, speed, accessibility and security

The site is a single-page app, so what a search engine or a link preview sees first is the HTML file the host serves, not the page the script builds. This section says how that HTML, the speed work, accessibility, security and measurement are set up, what is configured where, and what was and was not checked. The measured results, the issues found and the limits are in [`docs/technical-audit.md`](docs/technical-audit.md).

### Before launch (the owner's list)

1. **Set the site address.** Build with `VITE_SITE_URL=https://your-domain` (the origin only). Until it is set, every page says `noindex, nofollow` and the build prints a warning: no canonical address, language alternate, sitemap or structured data can be written without the real address, so none is guessed. This is the switch that lets search engines list the site.
2. Set the brand name in `src/config/site.ts`. While it is the template's "Your Name", structured data does not describe a person or a website by it.
3. Serve the files the way "Serving the site" says (the headers file, compression, `404.html`).
4. Set `VITE_CONTACT_ENDPOINT` / `VITE_QUOTE_ENDPOINT` (and make the handler reject what it does not expect, rate-limit, and allow this site's origin: CORS, validation and rate limiting live on the handler, not here).
5. Read `/privacy` ("Adatvédelem és sütik"). It states only what the code does; it is not legal advice and says nothing about how long the owner keeps a message or on what legal basis. Add what the law needs for the owner's situation (the owner's identity and contact details, retention, rights).
6. Decide whether the Work page ships as a placeholder. It is `noindex` and out of the sitemap while it is one (`routes/pages.ts`); make it indexable together with its content.
7. If measurement is wanted, set `VITE_ANALYTICS_ENDPOINT` (see "Measurement"). Without it the site measures nothing and asks nothing.

### Search engines (`src/seo/`, `scripts/`)

- **One head, built once.** `seo/head.ts` builds a page's head from the registry and the content: title, description, robots rule, canonical address, `hreflang` alternates (and `x-default`), Open Graph and Twitter tags, structured data. The browser applies it as the visitor moves (`seo/apply.ts`, from `routes/LanguageLayout.tsx`); the build prints it into each page's HTML (`seo/html.ts`). Titles and descriptions come from the pages' own content (`routes/documentMeta.ts`, `content/shop/meta.ts`, `content/projectDetails/meta.ts`, `content/labMeta.ts`, `content/privacyMeta.ts`), so every project, service and experiment has its own, in three languages, and a test refuses duplicates and lengths a search result would cut.
- **One HTML file per page and language** (`npm run build` → `scripts/prerender.mjs`): `dist/hu/index.html`, `dist/en/services/website/index.html`, …: 21 pages × 3 languages = 63 files, plus `index.html` for `/` (canonical: `/hu/`), `404.html`, `sitemap.xml`, `robots.txt` and `_headers`. Each carries its own `<html lang>`, head and a small `<noscript>` (the page's way to the main pages and the other languages). The page body is still drawn by script: a crawler that runs script (Google, Bing) sees the page; one that does not sees the head and the noscript.
- **Canonical addresses** are directory style (`/hu/services/`), absolute, without query or fragment: the only query parameters the site knows are development switches, and a query address names the same page. **Language versions** are real addresses (`/hu/…`, `/en/…`, `/nl/…`) linked from every page by real links (`LanguageSwitcher`) and by `hreflang`; nothing redirects by location or `Accept-Language`, crawlers included. `/` moves to `/hu/` (the default), the same for everyone.
- **Indexing rules** live in the registry (`PageDef.indexable`): the cart, the request builder, the 404 page and the Work placeholder are `noindex, follow` and not in the sitemap. `robots.txt` allows crawling (a crawler has to be able to read a `noindex`) and names the sitemap.
- **Structured data** (`seo/jsonLd.ts`): `WebSite` and `Person` once the brand is real; `WebPage` (or `AboutPage`, `ContactPage`, `CollectionPage`) with a `BreadcrumbList`; `CreativeWork` for a project (its stack as keywords, its lead screenshot) and for a Lab experience; `Service` for a service (name and summary). Nothing else: no rating, review, price, address, registration or certificate exists on the site, and a test refuses those words. `SoftwareApplication` was not used: the projects are portfolio case studies, not published products.
- **Shared picture:** `public/og/default.png` (1200×630, abstract, no words, so it never needs to change with a title or the brand). `node scripts/make-og-image.mjs` redraws it.
- **Checks:** `npm test` (the head, sitemap, structured data and build files), and after a build `npm run check:seo`, which reads the written files like a crawler: unique titles and descriptions, canonical = own address, hreflang reciprocity, sitemap = the indexable pages, JSON-LD parses and its references resolve, the CSP hashes match the page.

### Serving the site

`dist/` is static files. Every page exists as `…/index.html`; an unknown address should get `404.html` with status 404 (the app also shows its own 404 page and says `noindex` if a host answers every address with `index.html`). `dist/_headers` is written for Netlify and Cloudflare Pages; for another host, copy its values:

| Header | Why |
| --- | --- |
| `Content-Security-Policy` | `default-src 'self'`; scripts: self plus the hash of the one inline theme script; styles: self plus the hash of the one inline style; images `data:`/`blob:` (the Lab's saved pictures); `connect-src` self plus the origins of the form and measurement endpoints; no frames, no objects, `frame-ancestors 'none'`. Generated from `src/security/headers.ts`. |
| `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `Strict-Transport-Security`, `Permissions-Policy` | Standard hardening; `Permissions-Policy` switches off every browser feature the site never uses (camera, microphone, location, …). |
| `Cache-Control` | `/assets/*` (content-hashed): one year, immutable. Pictures and the shared image: one day, then revalidate. HTML: revalidate every time (the host's default). |

Canonical addresses end in a slash (`/hu/about/`); a host that redirects `/hu/about` to it, or serves both, is fine (the canonical decides), though the redirect costs a visitor who arrives on the slash-less form one extra round trip. Serve text files with gzip or Brotli (the host's default almost everywhere). No page of the site is served from another host: fonts and pictures are its own, and the CSP would refuse anything else.

### Speed

- Measured, not claimed: the numbers, the method and what could not be measured are in `docs/technical-audit.md`.
- Code is split per page; Three.js is its own chunk and loads only where a scene is shown: the hero and the intro (home), and one experience's own scene on its page. The shop, About, Contact, a project page, the privacy notice and the Lab overview load none of it.
- **The scene waits for the first screen** (`components/hero/startDeferral.ts`): the page has loaded and no larger paint has arrived for 300 ms (3 s at most) before the scene's code is requested. The generated graphic is on screen until then, as it is while the scene loads.
- **The intro opens only on the home page** (`config/intro.ts` `onlyOnHome`): a visitor who arrives on a project, About or a Lab experience from a search result gets that page. Set it to `false` to open the intro on any page except the shop.
- **The theme toggle cross-fades two pictures of the page** (View Transitions, `theme/theme.ts`) instead of transitioning the colour of every element: on an emulated phone the toggle took 1.2-1.6 s to respond before and about 0.15 s after. Browsers without View Transitions, and reduced motion, keep the old path (a colour transition) or switch at once.
- The brand font is preloaded (latin subset only); tried without the preload and with a low-priority preload, and the preload stayed: without it the services page shifted by 0.18.

### Errors

`components/ErrorBoundary/` keeps one failed page from becoming a blank screen: a page that throws, or whose code cannot be fetched (a connection that dropped, or a file replaced by a new deployment while the page was open), shows a panel in the visitor's language with "Try again" or "Reload", the header and footer stay, and moving on clears it. The Lab has its own boundaries below that (one experiment failing never reaches the site), the scenes fall back to the generated graphic or the still view on any failure or context loss, and the forms say plainly when nothing was sent (`forms/submit.ts`: success only after a 2xx, never otherwise). The 404 page lists the main pages.

### Measurement (`src/analytics/`)

Off unless `VITE_ANALYTICS_ENDPOINT` is set at build time (an https address; it receives each event as a JSON `POST`, no cookie, no credential, no referrer). With it set, a question appears (`components/Consent/`), and nothing is sent until the visitor accepts; "No, thanks" and a browser's Global Privacy Control or Do Not Track signal mean never; the footer's "Measurement settings" asks again. `track('project_opened', { project })` is the only call the site makes; the events are `service_viewed`, `package_selected`, `configurator_completed`, `quote_request_submitted`, `project_opened`, `lab_experience_opened`, and they can carry only ids, counts and yes/no (`analytics/events.ts`; `sanitize` drops anything else, so a typed description, an e-mail address or a recording cannot leak). To use a vendor's script instead of the endpoint, register a provider in `analytics/setup.ts` (`{ id, send(event) }`); the site knows no vendor, and a test refuses vendor hosts in the sources. There was no "generative object created" event because that experience was removed.

### Re-running the checks

`tools/audit/` holds the browser audits (head and CSP of every built page, axe, keyboard-only walk, layout matrix, WebGL failures, vitals, interaction latency, forms and measurement against a mock endpoint); its README says how to point it at a Playwright and axe-core installation. They test the built site, not the dev server (except `devharness.cjs`).

### What the audit did not touch, and why

That audit (PROMPT 11) was made when this repository had no backend; the backend that was added afterwards (PROMPT 12, `server/`, see "Backend" below) has its own tests and its own account of what was and was not verified in `docs/backend/README.md`. There is still no AI provider to review: the earlier Generative Objects experience (and with it the Meshy integration and its server) was deleted on 2026-11-01, so no Meshy key exists anywhere (the built files were searched for key patterns; none). The hidden racing experience is a link that takes the whole tab to nfsu2.xyz with `noreferrer noopener`; the site never frames it (that site forbids it).

## Backend

`server/` is the backend: it receives the contact form and the quote builder, stores them, e-mails the owner, serves the shop's catalogue and has an administration at `/admin` for the owner (a single-page application: `docs/admin/README.md`). It is one Node program (22.18 or newer, TypeScript run directly, **no runtime dependencies**) with a SQLite file. Everything about it, in one place: `docs/backend/README.md` (configuration, every endpoint, the administration's access rules, e-mail, what is stored about people, deployment, test results, and a list of what was **not** verified). The design and the audit it was built from: `docs/backend/architecture.md`.

```bash
cp .env.example .env                                   # every setting, described; no secrets in the file
npm run server:admin create you@example.com admin      # accounts are made here only; there is no sign-up
npm run server:start                                   # http://127.0.0.1:8787/admin
VITE_API_URL=http://localhost:8787 npm run dev         # the website's forms now send to it (CORS_ORIGINS=http://localhost:5173 on the server)
```

- **The forms.** With `VITE_API_URL` set at build time the contact form and the quote builder post to `/api/contact` and `/api/quote-requests`; they still say "sent" only after a 2xx answer, and with no address configured they still say they cannot send. The backend re-checks everything with the same limits (`server/test/contract.test.ts` holds the two sides against each other) and never reads a price from a request.
- **The catalogue.** This folder's static content (`src/content/`) is the seed of the backend's database; after that the database is the master copy and the owner edits prices, texts and the FAQ in the administration. Prices and texts reach the website's pages **without a build** since PROMPT 13.1 (and `catalog:pull` now also pulls the published portfolio projects, so the build prerenders each one's page and sitemap entry) (the browser lays the backend's catalogue over the website's own content when it starts; docs/cms/README.md §6), but the `<head>` a search engine reads still comes from the build: `CATALOG_API_URL=https://api.example.com npm run catalog:pull`, then `npm run build` (`src/content/catalogOverlay.ts` says exactly what the overlay may and may not change). Which packages, add-ons and services *exist* stays in the source.
- **No payment, no accounts, no 3D-generation endpoint, no uploads except an administrator's pictures** (docs/cms/README.md §5). The one AI endpoint is the Control Room AI assistant (below). Every price is still "on request"; the schema and the API can carry a published price and compute a fixed subtotal, and nothing ever trusts a figure from the browser.
- **Tests:** `npm test` runs the website's and the backend's (the backend's use a real in-process server, a real SQLite database, a mock SMTP server that speaks the protocol, and the real programs started in an empty folder).

## Quotation and order management

Quote-based, **no payment of any kind**. A request from the shop, FULL EXPERIENCE or CONTROL ROOM AI gets a public reference (`CC-2026-000001`), an owner notification and a customer confirmation; the administrator (`/admin/quotes`) writes a personal quotation in versions (money in whole minor units, tax only from a rate the administrator confirmed), sends it with a secure link, and the customer accepts, declines or asks for a change on a private page (`/{hu,en,nl}/quote/<secret>`), with the status of the request on another (`/…/request/<secret>`). Tokens are hashed, scoped, expiring, revocable and single-use for the three actions; the history is append-only. **Manual: [`docs/quotes/README.md`](docs/quotes/README.md); results and what was not verified (a real provider, DNS, the live test): [`docs/quotes/final-report.md`](docs/quotes/final-report.md).**

## Control Room AI

An AI assistant on every page (a floating panel) and at `/{hu,en,nl}/control-room`, answered **exclusively** by **Claude Haiku 5.5** (`claude-haiku-5-5`, a constant in code; no setting, no fallback, no other provider) through the Vercel AI SDK, behind the site's own backend. The assistant is offered only after an administrator has verified the model with a connection test and switched it on; if the model cannot be verified it stays unavailable and the rest of the site is unaffected. It answers only from published data through eight closed tools, helps a visitor plan a project, and turns the plan into a quote request only after the visitor presses "Send this request"; budgets and limits are enforced by the server before the model is called, and the administration (`/admin/ai`) shows usage, estimated cost, settings and what the assistant can read. **Full manual: [`docs/ai/README.md`](docs/ai/README.md); the model lock and its verification evidence: [`docs/ai/model-lock-report.md`](docs/ai/model-lock-report.md).**

- **Switched on by a key**: with `ANTHROPIC_API_KEY` set in the backend environment (never a `VITE_` variable). Without it the assistant is simply not offered and the rest of the site is unaffected.
- **Not verified with the real model**: it was built and tested against a scripted mock and a local stand-in for Anthropic's API; no real call was made. Run `npm run server:cli -- ai check` once with the real key, and read "What was not verified" in the manual before release.
- **Tests:** backend `server/test/ai*.test.ts`, website `src/content/ai/ai.test.ts`, `src/components/ai/RichText.test.ts`, `src/ai/client.test.ts`, `src/admin/lib/ai.test.ts`; a browser journey `tools/e2e/ai-journey.cjs` (31 steps) and `tools/audit/audit-ai.cjs` (the page and the panel at nine sizes, with axe).
