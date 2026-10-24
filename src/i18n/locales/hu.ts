// Hungarian is the default language and the source of the dictionary shape:
// en.ts and nl.ts are typed against it, so a missing or extra key fails the build.
export const hu = {
  meta: {
    title: 'Webfejlesztés és webalkalmazások',
    description: 'Átgondolt weboldalakat és webalkalmazásokat tervezek és fejlesztek.',
  },
  a11y: {
    skipToContent: 'Ugrás a tartalomhoz',
  },
  theme: {
    darkMode: 'Sötét mód',
  },
  language: {
    label: 'Nyelv',
  },
  status: {
    live: 'Élő',
    inProgress: 'Fejlesztés alatt',
    concept: 'Koncepció',
  },
  projects: {
    technologies: 'Technológiák',
  },
  services: {
    priceFrom: 'Kezdőár',
    priceQuote: 'Egyedi ajánlat kérése',
    priceTbd: 'Az ár hamarosan',
  },
  home: {
    underConstruction: 'Az oldal készül.',
  },
  notFound: {
    title: 'Az oldal nem található',
    description: 'Ez a cím nem létezik, vagy az oldal időközben máshová költözött.',
    backHome: 'Vissza a nyitóoldalra',
  },
}

export type Dictionary = typeof hu
