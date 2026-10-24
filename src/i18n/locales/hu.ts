// Hungarian is the default language and the source of the dictionary shape:
// en.ts and nl.ts are typed against it, so a missing or extra key fails the build.
export const hu = {
  meta: {
    title: 'Webfejlesztés és webalkalmazások',
    description: 'Átgondolt weboldalakat és webalkalmazásokat tervezek és fejlesztek.',
  },
  a11y: {
    skipToContent: 'Ugrás a tartalomhoz',
    opensInNewTab: '(új lapon nyílik meg)',
  },
  common: {
    backHome: 'Vissza a nyitóoldalra',
  },
  nav: {
    primary: 'Főmenü',
    menuOpen: 'Menü megnyitása',
    menuClose: 'Menü bezárása',
    home: 'Kezdőlap',
    work: 'Munkáim',
    services: 'Szolgáltatások',
    about: 'Rólam',
    lab: 'Lab',
    contact: 'Kapcsolat',
  },
  cta: {
    startProject: 'Indítsunk projektet',
  },
  hero: {
    titleLine1: 'Építs digitálisan.',
    titleLine2: 'Ami valóban számít.',
    description:
      'Átgondolt weboldalakat és webalkalmazásokat tervezek és építek, a technológiát, a kreativitást és a részletek iránti érzéket ötvözve.',
    ctaPrimary: 'Munkáim megtekintése',
    scrollCue: 'Görgess a felfedezéshez',
  },
  theme: {
    darkMode: 'Sötét mód',
  },
  language: {
    label: 'Nyelv',
  },
  footer: {
    role: 'Weboldalak és webalkalmazások tervezése és fejlesztése.',
    navLabel: 'Lábléc menü',
    pagesHeading: 'Oldalak',
    contactHeading: 'Kapcsolat',
    contactIntro: 'Van egy ötleted vagy kérdésed? Beszéljük meg.',
    contactLink: 'Írj nekem',
    socialHeading: 'Közösségi profilok',
    legalLabel: 'Jogi hivatkozások',
    legal: {
      privacy: 'Adatvédelem',
      legalNotice: 'Jogi nyilatkozat',
    },
    rights: 'Minden jog fenntartva.',
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
  placeholder: {
    description: 'Ez az oldal hamarosan elkészül.',
  },
  notFound: {
    title: 'Az oldal nem található',
    description: 'Ez a cím nem létezik, vagy az oldal időközben máshová költözött.',
  },
}

export type Dictionary = typeof hu
