// Hungarian is the source of the dictionary shape (English is the fallback language of the site, i18n/config.ts):
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
    priceQuoteHint: 'Az ár a projekt terjedelmétől függ.',
    priceExact: 'A pontos összeg az ajánlatban szerepel.',
    vat: {
      excluded: '+ ÁFA',
      included: 'ÁFÁ-val együtt',
      exempt: 'ÁFA-mentes',
    },
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
        text: 'Modern, minden eszközön jól működő weboldalak és webalkalmazások üzleti célokra, átgondolt tervezéssel és fejlesztéssel.',
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
          text: 'Minden eszközön jól működő, modern weboldalak, egyedi vizuális megjelenéssel.',
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
      more: 'Többet rólam',
    },
    lab: {
      title: 'A Lab',
      intro: 'Kísérleti digitális játszótér: öt interaktív WebGL-élmény, a részecskéktől a kromatikus torzításig. Három ízelítő itt, mind az öt a Labban vár.',
      enter: 'Belépés a Labba',
      open: 'Megnyitás',
    },
    packages: {
      title: 'Hogyan dolgozhatunk együtt',
      intro: 'Négy kiindulási forma. A pontos tartalmat és az árat a projekthez igazítjuk.',
      audienceLabel: 'Kinek szól',
      includesLabel: 'Tartalmazza',
      cta: 'Ajánlatkérés',
    },
    final: {
      title: 'Valósítsuk meg.',
      text: 'Mesélj az ötletedről, és nézzük meg, hogyan válhat belőle működő digitális élmény.',
      cta: 'Beszéljünk a projektedről',
      emailLead: 'Vagy írj közvetlenül:',
    },
  },
  aboutPage: {
    meta: {
      title: 'Rólam és a munkamódszerem',
      description:
        'Logisztikából a szoftverfejlesztésbe: a történetem, a munkamódszerem, a technológiáim és a jelenlegi szakmai fókuszom.',
    },
    hero: {
      titleLine1: 'Nem csak kódot írok.',
      titleLine2: 'Digitális élményeket építek.',
      lead: 'Hiszek abban, hogy a jó fejlesztés a technológia, a kreativitás és a problémamegoldó gondolkodás találkozásából születik.',
      ctaPrimary: 'Nézd meg a munkáimat',
      ctaSecondary: 'Lépj kapcsolatba velem',
    },
    story: {
      fromLabel: 'Logisztika',
      toLabel: 'Szoftverfejlesztés',
      skillsTitle: 'Amit magammal vittem',
      skillsIntro: 'Hét készség, amely az egyik területről a másikra átvihető, és ahogyan a fejlesztésben megjelenik.',
    },
    approach: {
      title: 'Hogyan dolgozom',
      intro: 'Négy alapelv, amelyek egymásba kapcsolódnak.',
    },
    skills: {
      title: 'Technológiák',
      intro: 'Az eszközök, amelyekkel dolgozom, csoportosítva.',
      note: 'A lista az eszközöket sorolja fel, nem tudásszintet.',
      levels: {
        learning: 'Tanulom',
        working: 'Dolgozom vele',
        confident: 'Magabiztosan használom',
      },
    },
    focus: {
      title: 'Jelenlegi fókusz',
      intro: 'Amire most a legtöbb figyelmet fordítom.',
    },
    final: {
      title: 'Építsünk valami maradandót.',
      text: 'Minden jó projekt egy beszélgetéssel kezdődik.',
      cta: 'Kapcsolatfelvétel',
    },
  },
  contactPage: {
    meta: {
      title: 'Kapcsolat',
      description: 'Írj nekem szakmai lehetőségről, együttműködésről vagy webfejlesztési projektről.',
    },
    hero: {
      title: 'Van egy jó ötleted?',
      lead: 'Beszéljünk róla. Legyen szó egy új projektről, szakmai lehetőségről vagy együttműködésről, szívesen meghallgatom.',
      doorsLabel: 'Válaszd ki, miről szeretnél beszélni',
      employers: {
        label: 'Munkáltatóknak',
        title: 'Szakmai lehetőség, fejlesztői pozíció vagy csapatmunka.',
        cta: 'Beszéljünk a lehetőségről',
      },
      clients: {
        label: 'Ügyfeleknek',
        title: 'Weboldal, webalkalmazás vagy egyedi digitális megoldás.',
        cta: 'Indítsunk projektet',
      },
    },
    form: {
      title: 'Írj nekem',
      intro: 'Pár sor is elég: a témát, a tárgyat és az üzenetet várom, és azt, hogyan válaszolhatok.',
      aside: {
        title: 'Tudnivalók',
        items: [
          'Amíg el nem küldöd, az üzeneted csak ezen az oldalon, a böngésző memóriájában van: sehová nem mentem el. Az oldal újratöltésekor elvész.',
          'Csak a neved és az e-mail-címed kell, hogy válaszolhassak.',
        ],
      },
      fields: {
        name: { label: 'Neved', hint: 'A keresztneved is elég.' },
        email: { label: 'E-mail-cím', hint: 'Erre válaszolok.' },
        kind: {
          label: 'Miről szeretnél beszélni?',
          options: {
            job: 'Álláslehetőség',
            collaboration: 'Együttműködés',
            project: 'Webfejlesztési projekt',
            other: 'Egyéb',
          },
        },
        subject: { label: 'Tárgy', hint: 'Néhány szó arról, miről van szó.' },
        message: {
          label: 'Üzenet',
          hint: 'Írd le, miben gondolkodsz. Néhány mondat elég.',
          count: '{count} / {max}',
        },
        consent: {
          label: 'Tudomásul veszem, hogy a megadott adatokat az üzenet megválaszolásához használják fel.',
          privacy: 'Adatkezelési tájékoztató',
          pending: 'Az adatkezelési tájékoztató elérési útja még nincs megadva: src/config/site.ts',
        },
      },
      subjects: {
        job: 'Szakmai lehetőség',
        collaboration: 'Együttműködés',
        project: 'Webfejlesztési projekt',
      },
      errors: {
        required: {
          name: 'Add meg a neved.',
          email: 'Add meg az e-mail-címed, hogy válaszolhassak.',
          kind: 'Válaszd ki, miről szeretnél beszélni.',
          subject: 'Írj egy rövid tárgyat.',
          message: 'Írj néhány szót az üzenetben.',
        },
        tooShort: 'Legalább {min} karakter kell ide.',
        tooLong: 'Legfeljebb {max} karakter lehet.',
        invalidEmail: 'Ez nem tűnik érvényes e-mail-címnek. Nézd meg, hogy van-e benne @ jel, és utána egy tartomány.',
        consentRequired: 'A küldéshez ezt be kell jelölnöd.',
      },
      actions: {
        send: 'Üzenet elküldése',
        prepare: 'Összegzés elkészítése',
        sending: 'Küldés…',
      },
      summary: {
        title: 'Kapcsolatfelvétel',
        heading: 'Összegzés',
        empty: '—',
        labels: {
          kind: 'Téma',
          subject: 'Tárgy',
          message: 'Üzenet',
          name: 'Név',
          email: 'E-mail',
          language: 'Nyelv',
        },
      },
      unavailable: {
        notice:
          'Az online beküldés még nincs bekötve. Kitöltheted az űrlapot, de az üzenet innen most nem tud elmenni: a végén az összegzést kimásolhatod.',
        title: 'Az üzenet nem lett elküldve',
        text: 'Az online beküldés még nincs beállítva, ezért semmi nem ment el. Az üzeneted itt maradt: másold ki az összegzést, és küldd el másik úton.',
        copy: 'Összegzés másolása',
        copied: 'Az összegzés a vágólapon van.',
        copyFailed: 'A másolás nem sikerült. Jelöld ki és másold ki kézzel az alábbi szöveget.',
        mail: 'Megnyitás e-mail-vázlatként',
        mailNote: 'Megnyílik az e-mail-programod egy vázlattal; csak akkor megy el, ha ott elküldöd.',
        subject: 'Kapcsolatfelvétel',
      },
      failed: {
        title: 'Nem sikerült elküldeni',
        network: 'Nem értem el a szolgáltatást. Az üzeneted itt maradt; ellenőrizd a kapcsolatot, és próbáld újra.',
        timeout:
          'A küldés túl sokáig tartott, ezért nem tudom, megérkezett-e. Az üzeneted itt maradt; próbáld újra később.',
        rejected: 'A szolgáltatás nem fogadta el az üzenetet. Az üzeneted itt maradt; próbáld újra később.',
      },
      sent: {
        title: 'Elküldve',
        text: 'Az üzeneted elküldve. A megadott e-mail-címen válaszolok.',
        again: 'Új üzenet',
      },
    },
    links: {
      title: 'Más módon is elérsz',
    },
  },
  project: {
    backToPortfolio: 'Vissza a portfólióhoz',
    preview: {
      title: 'Előnézet',
      banner: 'Előnézet: ez a projekt még nem nyilvános (állapot: {state}). Csak te látod, az adminisztrációba bejelentkezve.',
      signIn: 'Az előnézethez jelentkezz be az adminisztrációba.',
      states: { draft: 'piszkozat', published: 'közzétett', archived: 'archivált' },
    },
    videoLink: 'Videó',
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
      results: 'Eredmények',
      links: 'Hivatkozások',
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
  workPage: {
    meta: {
      title: 'Munkáim',
      description: 'Válogatás a projektjeimből: webes és mobilalkalmazások, platformok és koncepciók, mindegyik a valódi állapotával megjelölve.',
    },
    hero: {
      eyebrow: 'Munkáim',
      titleLine1: 'Amit építettem,',
      titleLine2: 'ahogy valójában van.',
      lead: 'Minden projekt a saját állapotával szerepel: élő, bemutató, készülő vagy koncepció. Nincs kitalált eredmény és nincs kitalált vélemény.',
    },
    filter: { label: 'Projektek szűrése', all: 'Mind' },
    count: '{count} projekt',
    loading: 'A projektek betöltése…',
    empty: 'Még nincs közzétett projekt.',
    emptyFilter: 'Ebben a kategóriában még nincs projekt.',
    draft: 'Piszkozat: még nem nyilvános',
  },
  placeholder: {
    description: 'Ez az oldal hamarosan elkészül.',
  },
  consent: {
    region: 'Mérés és adatvédelem',
    title: 'Mérhetjük, mi működik az oldalon?',
    text: 'Névtelen eseményeket küldenénk, például hogy melyik oldalt nyitották meg. Nem tartalmaznak személyes adatot, és soha nem küldjük el, amit beírsz egy űrlapba.',
    accept: 'Elfogadom',
    decline: 'Nem, köszönöm',
    details: 'Részletek az adatvédelmi tájékoztatóban',
    settings: 'Mérési beállítások',
    saved: 'A választásodat elmentettük ezen az eszközön.',
  },
  notFound: {
    title: 'Az oldal nem található',
    description: 'Ez a cím nem létezik, vagy az oldal időközben máshová költözött.',
    suggestions: 'Innen tovább tudsz lépni:',
  },
  errors: {
    title: 'Az oldal nem töltött be',
    text: 'Valami félrement az oldal betöltésekor. Próbáld újra; ha nem segít, töltsd újra az oldalt.',
    offline: 'Úgy tűnik, nincs internetkapcsolatod. Ellenőrizd a kapcsolatot, majd próbáld újra.',
    outdated: 'Az oldal közben megújult, ezért ez a rész nem érhető el. Töltsd újra az oldalt.',
    retry: 'Próbáld újra',
    reload: 'Oldal újratöltése',
    home: 'Vissza a nyitóoldalra',
  },
}

export type Dictionary = typeof hu
