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
  intro: {
    titleLine1: 'Üdvözlök',
    titleLine2: 'a weboldalak',
    titleLine3: 'következő',
    titleLine4: 'dimenziójában.',
    supporting: 'A digitális tér a te mozdulatodra reagál.',
    cta: 'Kattints a belépéshez',
    ctaTouch: 'Koppints a belépéshez',
    hint: 'Mozdítsd a pointert. Alakítsd a teret.',
    hintTouch: 'Húzd az ujjad. Alakítsd a teret.',
    skip: 'Ne mutasd újra',
  },
  hero: {
    titleLine1: 'Digitális élmények.',
    titleLine2: 'Valódi hatással.',
    description:
      'Weboldalakat és webalkalmazásokat tervezek és fejlesztek, ahol a technológia, a kreativitás és a részletekre való odafigyelés találkozik.',
    ctaPrimary: 'Fedezd fel a munkáimat',
    ctaSecondary: 'Beszéljünk a projektedről',
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
    demo: 'Demóprojekt',
    inProgress: 'Fejlesztés alatt',
    concept: 'Koncepció',
  },
  projects: {
    technologies: 'Technológiák',
  },
  services: {
    priceFrom: 'Kezdőár',
    priceQuote: 'Kérj egyedi ajánlatot',
    priceTbd: 'Az ár hamarosan',
  },
  home: {
    path: {
      title: 'Válaszd az utad',
      career: {
        label: 'Karrier és munkáltatók',
        title: 'Együtt építsünk valami értékeset.',
        text: 'Ismerd meg a projektjeimet, a technológiai hátteremet és a problémamegoldási szemléletemet.',
        cta: 'Portfólió megtekintése',
      },
      clients: {
        label: 'Ügyfelek és vállalkozások',
        title: 'Van egy ötleted? Valósítsuk meg.',
        text: 'Modern, reszponzív weboldalak és webalkalmazások üzleti célokra, átgondolt tervezéssel és fejlesztéssel.',
        cta: 'Indítsunk projektet',
      },
    },
    work: {
      title: 'Kiemelt munkák',
      intro: 'Válogatás a projektjeimből. Mindegyiknél jelölöm, milyen állapotban van.',
      conceptSketch: 'Koncepcióvázlat',
      imageAlt: '{name} képernyőképe',
      demo: 'Élő demó',
      details: 'Részletek',
      noDetails: 'A részletes oldal még nem készült el.',
      items: {
        spendly: {
          category: 'Pénzügyi alkalmazás',
          description:
            'Modern pénzügyi alkalmazás koncepciója a kiadások átlátható követéséhez és a mindennapi pénzügyek kezeléséhez.',
        },
        bookinghub: {
          category: 'Időpontfoglaló webalkalmazás',
          description:
            'Időpontfoglalási rendszer koncepciója, amely az ügyféloldali foglalási folyamatot és a szolgáltatás digitális élményét helyezi középpontba.',
        },
        hollandia: {
          category: 'Információs weboldal',
          description:
            'Magyar nyelvű információs platform a Hollandiába költözők és az ott új életet kezdők támogatására.',
        },
        logistics: {
          category: 'Logisztikai webalkalmazás',
          description: 'Logisztikai és fuvarozási folyamatok digitalizálására tervezett alkalmazáskoncepció.',
        },
      },
    },
    build: {
      title: 'Amit építek',
      items: {
        websites: {
          title: 'Weboldalak',
          text: 'Reszponzív, modern weboldalak, egyedi vizuális megjelenéssel.',
        },
        webapps: {
          title: 'Webalkalmazások',
          text: 'Interaktív alkalmazások átgondolt felhasználói folyamatokkal.',
        },
        mobile: {
          title: 'Mobilélmények',
          text: 'Mobilra optimalizált felületek és alkalmazásélmények.',
        },
        integrations: {
          title: 'Integrációk',
          text: 'API-k és digitális szolgáltatások összekapcsolása a projekt tényleges igényei szerint.',
        },
      },
    },
    about: {
      title: 'A jó digitális élmény nem véletlen.',
      text: 'Számomra a fejlesztés nem csupán kódírás. A cél az, hogy egy ötletből átgondolt, használható és vizuálisan karakteres digitális termék szülessen.',
      principles: ['Átgondolt', 'Használható', 'Karakteres'],
      principlesLabel: 'Három szó, amelyek a célt összefoglalják',
      stackHeading: 'Ezzel épült ez az oldal',
      stackNote: 'Az eszközök ennek az oldalnak a forráskódjából származnak.',
      storyHeading: 'Történet',
      experienceHeading: 'Tapasztalat',
      educationHeading: 'Tanulmányok',
      skillsHeading: 'Készségek',
    },
    lab: {
      title: 'A Lab',
      intro: 'Kísérleti felület kreatív megoldásoknak. Az alábbi irányok koncepciók, még nem működő demók.',
      items: {
        particles: {
          title: 'Particle Playground',
          text: 'Részecskék, amelyek a mozdulatodra reagálnak: sűrűsödnek, szétszóródnak, mintázatot rajzolnak.',
        },
        liquid: {
          title: 'Liquid Geometry',
          text: 'Geometrikus formák, amelyek folyadékként olvadnak egymásba.',
        },
        motion: {
          title: 'Motion Experiments',
          text: 'Időzítés, könnyítés és ritmus: a mozgás nyelvének kísérletei.',
        },
      },
    },
    packages: {
      title: 'Hogyan dolgozhatunk együtt',
      intro: 'Négy kiindulási forma. A pontos tartalmat és az árat a projekthez igazítjuk.',
      audienceLabel: 'Kinek szól',
      includesLabel: 'Tartalmazza',
      cta: 'Ajánlatkérés',
      items: {
        launch: {
          description: 'Egy világos, gyors weboldal, amellyel elindulhatsz.',
          audience: 'Induló vállalkozásoknak és magánszemélyeknek, akiknek első vagy új webes jelenlét kell.',
          includes: ['Reszponzív weboldal', 'Tartalmi és oldalstruktúra', 'Alap SEO-beállítások', 'Átadás és használati útmutató'],
        },
        grow: {
          description: 'Meglévő jelenlét fejlesztése: új szekciók, jobb élmény, bővítés.',
          audience: 'Működő weboldallal rendelkező vállalkozásoknak, amelyek tovább akarnak lépni.',
          includes: [
            'A meglévő oldal áttekintése',
            'Új oldalak és funkciók',
            'Teljesítmény és használhatóság javítása',
            'Közösen megfogalmazott célok',
          ],
        },
        build: {
          description: 'Egyedi webalkalmazás az ötlettől az első használható verzióig.',
          audience: 'Vállalkozásoknak és csapatoknak, akiknek egy konkrét folyamathoz egyedi alkalmazás kell.',
          includes: ['Igényfelmérés és tervezés', 'Felhasználói felület és élmény', 'Fejlesztés és tesztelés', 'Szükséges szolgáltatások integrálása'],
        },
        care: {
          description: 'Folyamatos gondoskodás: frissítés, javítás, kisebb fejlesztések.',
          audience: 'Meglévő weboldalak és alkalmazások tulajdonosainak.',
          includes: ['Frissítések és karbantartás', 'Hibajavítás', 'Kisebb módosítások', 'Rendszeres áttekintés'],
        },
      },
    },
    final: {
      title: 'Valósítsuk meg.',
      text: 'Mesélj az ötletedről, és nézzük meg, hogyan válhat belőle működő digitális élmény.',
      cta: 'Beszéljünk a projektedről',
      emailLead: 'Vagy írj közvetlenül:',
    },
  },
  project: {
    backToPortfolio: 'Vissza a portfólióhoz',
    repoName: 'A tárolóban és a felületen: {name}',
    reviewed: 'Dokumentáció és kód alapján, áttekintve: {date}',
    sourceLink: 'Forráskód',
    demoLink: 'Élő demó',
    heroImage: 'Képernyőkép',
    stackLabel: 'Használt technológiák',
    stackGroups: {
      frontend: 'Frontend',
      backend: 'Backend',
      data: 'Adat',
      infrastructure: 'Infrastruktúra',
      testing: 'Tesztelés',
      services: 'Külső szolgáltatások',
    },
    sections: {
      overview: 'Áttekintés',
      challenge: 'A kihívás',
      approach: 'A megközelítés',
      architecture: 'Technikai architektúra',
      features: 'Főbb funkciók',
      decisions: 'Tervezési döntések',
      learned: 'Tanulságok és következő lépések',
      gallery: 'Galéria',
    },
    overview: {
      what: 'Mi ez',
      audience: 'Kinek szól',
      problem: 'Milyen problémát old meg',
      goal: 'A fejlesztés célja',
      role: 'Saját szerepem',
    },
    challenge: {
      problem: 'A probléma',
      solution: 'A megoldás',
      source: 'Dokumentálva',
    },
    architecture: {
      label: 'A rendszer rétegei fentről lefelé',
      connections: 'Kapcsolatok',
      status: {
        built: 'Működik',
        partial: 'Részben működik',
        planned: 'Tervezett',
      },
    },
    features: {
      groups: {
        done: 'Elkészült',
        partial: 'Részben működik',
        planned: 'Tervezett',
      },
      limits: 'Amit (még) nem tud',
      showScreenshot: 'Képernyőkép megnyitása',
    },
    learned: {
      next: 'Lehetséges következő lépések',
      pending: 'Saját tanulságok: src/content/projectDetails',
    },
    gallery: {
      desktop: 'Asztali nézet',
      mobile: 'Mobilnézet',
      open: 'Megnyitás nagyban: {title}',
      close: 'Bezárás',
      previous: 'Előző kép',
      next: 'Következő kép',
      counter: '{current} / {total}',
      dialog: 'Képgaléria',
    },
    nav: {
      label: 'Projektek között',
      previous: 'Előző projekt',
      next: 'Következő projekt',
      all: 'Összes projekt',
    },
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
