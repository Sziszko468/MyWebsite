# Archive data model

Part of the [Command Center and Digital Archive](README.md). The source is `src/archive/model.ts`.

## 1. An entry

```ts
interface ArchiveEntry {
  id: string            // "entry-<kind>-<slug>": the direct link
  kind: 'project' | 'demo' | 'lab' | 'tool'
  title: string         // in the page's language
  description: string
  category: string      // a key, the filter's value; '' when the record names no usable one
  categoryLabel: string // its name in the page's language, never the key (DATA_INTEGRITY §2)
  status: 'live' | 'demo' | 'in-progress' | 'concept' | 'ready'
  tags: readonly string[]
  href: string | null   // its page (language-free); null for a published project that has none
  related: { kind: 'project' | 'demo'; href: string } | null
  visual: { type: 'image', src, width, height, alt } | { type: 'mockup', kind } | { type: 'lab', id } | { type: 'tool' }
  order: number         // the curated order
}
```

These are all the fields there are. **No date, view count, rating, client, award or result** exists, and a test fails if an entry gains one.

## 2. Where each field comes from

| Field | Project | Demo | Lab experience | Design tool |
| --- | --- | --- | --- | --- |
| title | project name | `"{project}: {demo name}"` | experiment name | `playgroundEntry.title` |
| description | card description | `demoEntry.kinds[type].summary` | `experiment.tagline` | `playgroundMeta.description` |
| category / label | the CMS category and its name, or the neutral words | the project's | `creative-coding` (words) | `design-tools` (words) |
| status | project status | the project's | experiment status (`ready` → *Interactive*) | `ready` |
| tags | project tags | the project's | experiment tech | `React`, `TypeScript`, `SCSS` (what it is built with) |
| href | `detailPath` | `/work/<slug>/demo` | `/lab/<id>` when ready | `/lab/design-system` |
| related | its demo | its project | — | — |
| visual | screenshot, else the project's concept sketch | the project's sketch | the experience's still art | the five brand colours |
| order | the administrator's order | after projects | after demos, by number | last |

## 3. Public / private separation

What `buildEntries` and `useArchive` accept:

* **Only the public list** (`useProjectList(false)`); a list loaded through an administrator's preview is not used.
* A card with `draft: true`, an invalid slug, an empty name or an unknown status is **dropped** even if it is passed in (tested), and a project that has nothing to say in the language is not listed.
* Each address is listed once. A **demo** is listed only if the project is listed, has a page, and its public detail (about that project, not a draft, available in the language, and from the
  backend whenever the list is) has an enabled, registered demo for that slug.
* Nothing is read from the administration, the portal, quotations, bookings, analytics, the assistant or the contact form; there is no request to any `/api/admin`, `/api/portal`, quote or
  booking endpoint and no storage. A source-scan test checks the imports and the strings; the journey watches the requests.

## 4. Search, filtering, sorting

* **Normalization**: NFD, diacritics removed, lower case, single spaces: `"Időpont"` and `"idopont"` match.
* **Search** looks in the title, description, category name, kind name, status name and tags; **every** word must be found.
* **Filters**: one kind, one category, one status, together with the search.
* **Facets** (`facetsOf`) list only values that at least one entry has, with their counts.
* **Sorting**: `curated` (the `order`), `name`, `name-desc` (`Intl.Collator` of the page's language: Hungarian sorts *Ábel* before *Béke*), `kind` (then name). A sort never changes the list it got.
* **The address**: `q` (≤ 80, control characters replaced), `kind`, `category` (`[a-z0-9-]`, ≤ 40, or `project.creative-coding` / `project.design-tools`), `status`, `sort`; unknown values are ignored.

## 5. Today's content (the website's own, no backend)

| Kind | Entries |
| --- | --- |
| Projects | Spendly, BookingHub, Hollandia Kezdőknek (*concept*, no page), Logistics Platform |
| Demos | Spendly, BookingHub, Logistics Platform |
| Lab experiences | Particle Universe, Liquid Matter, Type in Motion, Infinite Space, Chromatic Distortion, Generative Objects |
| Design tool | Design System Playground |

Categories: *Web and mobile apps* (Spendly, BookingHub and their demos), *Platforms and systems* (Logistics and its demo), *Concepts and guides* (Hollandia), *Creative coding* (the six), *Design tools*
(the playground). Statuses: *Demo*, *Concept*, *Interactive*.

## 6. Limitations of the model

* One category per entry, one status. A project's CMS card label (the small line above its title) is not an archive field.
* A project's picture is its screenshot if one is set in the content; the website's own content has none, so sketches are shown (labelled as sketches).
* No relations beyond project ↔ demo; no "similar" entries.
