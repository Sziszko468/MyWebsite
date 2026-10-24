# Controlled Chaos — portfolio

React + TypeScript + Vite. Racing Red edition: Dark and Light themes, three languages (hu default, en, nl).

```bash
npm run dev        # dev server; /hu/design-system shows every token and component
npm run build      # type-check + production build
npm run typecheck  # tsc -b
npm run lint       # oxlint
npm test           # vitest: contrast, i18n parity, paths, theme
```

## Where things live

| Path | What |
| --- | --- |
| `src/styles/tokens.css` | The design tokens. Brand palette, scales, and one semantic colour block per theme. Change values here only. |
| `src/styles/global.scss`, `_mixins.scss` | Reset, global focus ring, theme-transition rule; breakpoints and interaction mixins. |
| `src/theme/` | `ThemeProvider`, `useTheme`, storage and resolution logic. `index.html` holds the matching pre-paint script. |
| `src/i18n/` | `config.ts` (languages), `locales/*.ts` (dictionaries), `paths.ts` (URL helpers), `I18nProvider`. |
| `src/components/` | Button, Container, SectionHeading, Badge, ProjectCard, ServiceCard, ThemeToggle, LanguageSwitcher, LocalizedLink, SiteToolbar. |
| `src/routes/`, `src/pages/` | `/:lang` layout and pages. `DesignSystemPage` exists in dev builds only. |
| `src/config/site.ts` | Brand name placeholder. |

## Conventions

- **Colours:** components use semantic tokens (`--color-*`), never hex values. Raw brand colours (`--brand-*`) are for tokens and decorative art.
- **Themes:** `data-theme="dark|light"` on `<html>`. Dark is the default. The choice is stored in `localStorage` under `theme`; without one, the system setting applies.
- **Strings:** every UI string comes from `src/i18n/locales/*`. `hu.ts` defines the shape, so `en.ts` and `nl.ts` fail to compile when a key is missing or extra.
- **URLs:** `/hu/`, `/en/`, `/nl/`; `/` redirects to `/hu/`. The language switcher keeps the current page, query and hash.
- **Hosting:** the site is a single-page app, so the host must serve `index.html` for every path.
