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
    priceQuoteHint: 'Az ár a projekt terjedelmétől függ.',
    priceExact: 'A pontos összeg az ajánlatban szerepel.',
    vat: {
      excluded: '+ ÁFA',
      included: 'ÁFÁval együtt',
      exempt: 'ÁFA-mentes',
    },
  },
  servicesPage: {
    meta: {
      title: 'Szolgáltatások és csomagok',
      description:
        'Egyedi weboldalak és webalkalmazások: szolgáltatások, négy kiindulási csomag és egyedi ajánlatkérés.',
    },
    hero: {
      titleLine1: 'A te ötleted.',
      titleLine2: 'A következő lépés.',
      lead: 'Egyedi weboldalak és webalkalmazások, amelyek ötvözik a karakteres megjelenést a valódi használhatósággal.',
      ctaPrimary: 'Válassz szolgáltatást',
      ctaSecondary: 'Kérj egyedi ajánlatot',
      indexLabel: 'Az oldal részei',
      index: {
        areas: 'Szolgáltatások',
        packages: 'Csomagok',
        quote: 'Ajánlatkérés',
        process: 'Folyamat',
        faq: 'GYIK',
      },
    },
    areas: {
      title: 'Amit vállalok',
      intro:
        'Négy terület, ahol segíthetek. A részletek projektenként változnak; a pontos tartalmat az ajánlatkérés után tisztázzuk.',
      featuresLabel: 'Ami ide tartozhat',
      exampleLabel: 'Példa a munkáimból',
      cta: 'Ajánlatot kérek',
    },
    packages: {
      title: 'Csomagok',
      intro:
        'Négy kiindulási forma. Ezek nem végleges ajánlatok: a pontos tartalmat, az árat és a határidőt az ajánlatkérés után, a projekt ismeretében véglegesítjük.',
      legend: 'Válassz csomagot',
      choose: 'Kiválasztom',
      chosen: 'Kiválasztva',
      rows: {
        audience: 'Kinek szól',
        fits: 'Milyen projekthez illik',
        includes: 'Ami beletartozhat',
        price: 'Ár',
        timeline: 'Határidő',
      },
      timeline: {
        scope: 'A projekt terjedelmétől függ, az ajánlatban rögzítjük.',
        estimate: 'Jellemzően {range} {unit}; az ajánlatban erősítjük meg.',
        units: {
          days: { one: 'nap', other: 'nap' },
          weeks: { one: 'hét', other: 'hét' },
          months: { one: 'hónap', other: 'hónap' },
        },
      },
      bar: {
        none: 'Még nem választottál csomagot. Választhatsz fent, vagy kérhetsz ajánlatot csomag nélkül is.',
        some: 'Kiválasztott csomag: {name}',
        ctaSome: 'Tovább az ajánlatkéréshez',
        ctaNone: 'Egyedi ajánlatkérés',
      },
    },
    quote: {
      title: 'Kérj egyedi ajánlatot',
      intro:
        'Írd le röviden, miben gondolkodsz. Hét kérdés négy lépésben; ami nem kötelező, azt jelöltem. Bármikor visszaléphetsz és javíthatsz.',
      aside: {
        title: 'Tudnivalók',
        items: [
          'Az ajánlatkérés még nem megrendelés.',
          'Amíg el nem küldöd, a válaszaid csak ezen az oldalon, a böngésző memóriájában vannak: sehová nem mentem el őket. Az oldal újratöltésekor elvesznek.',
          'A pontos terjedelem, az ár és a határidő az ajánlatkérés után, közös egyeztetéssel véglegesedik.',
        ],
      },
      stepsLabel: 'Az ajánlatkérés lépései',
      stepOf: 'Lépés {current} / {total}',
      stepDone: 'kész',
      stepCurrent: 'jelenlegi lépés',
      steps: {
        project: 'Projekt',
        details: 'Részletek',
        extras: 'Keret és idő',
        contact: 'Elérhetőség',
      },
      stepTitles: {
        project: 'Miről van szó?',
        details: 'Mesélj a projektről',
        extras: 'Költségkeret és időzítés',
        contact: 'Hogyan érhetlek el?',
      },
      optional: 'nem kötelező',
      fields: {
        projectType: {
          label: 'Milyen típusú projektről van szó?',
          options: {
            website: 'Weboldal',
            webapp: 'Webalkalmazás',
            ui: 'Meglévő design megvalósítása',
            integrations: 'API vagy integráció',
            maintenance: 'Meglévő oldal karbantartása, fejlesztése',
            unsure: 'Még nem tudom',
          },
        },
        package: {
          label: 'Melyik csomag érdekel?',
          hint: 'Ha fent választottál, itt már ki van töltve; átállíthatod.',
          unsure: 'Még nem tudom, segíts választani',
        },
        description: {
          label: 'Mi a projekt röviden?',
          hint: 'Mit szeretnél létrehozni, kinek, és mi a cél? Néhány mondat elég.',
          count: '{count} / {max}',
        },
        reference: {
          label: 'Van meglévő weboldal vagy referencia?',
          hint: 'Egy link, vagy néhány szó arról, ami tetszik.',
        },
        budget: {
          label: 'Hozzávetőleges költségkeret',
          hint: 'Ha van elképzelésed, írd le összeggel és pénznemmel. Ha nincs, hagyd üresen.',
        },
        timing: {
          label: 'Mikorra szeretnéd a projektet?',
          placeholder: 'Nem adom meg',
          options: {
            unsure: 'Még nem tudom',
            asap: 'Minél hamarabb',
            weeks: 'A következő hetekben',
            months: 'A következő hónapokban',
            flexible: 'Nincs sietség',
          },
        },
        name: { label: 'Neved', hint: 'A keresztneved is elég.' },
        email: { label: 'E-mail-cím', hint: 'Erre válaszolok.' },
        phone: { label: 'Telefonszám', hint: 'Csak ha inkább telefonon beszélnél.' },
        consent: {
          label: 'Tudomásul veszem, hogy a megadott adatokat az ajánlatkérés megválaszolásához használják fel.',
          privacy: 'Adatkezelési tájékoztató',
          pending: 'Az adatkezelési tájékoztató elérési útja még nincs megadva: src/config/site.ts',
        },
      },
      errors: {
        required: {
          projectType: 'Válaszd ki, milyen típusú projektről van szó.',
          package: 'Válassz csomagot, vagy jelöld, hogy még nem tudod.',
          description: 'Írj néhány szót a projektről.',
          timing: 'Válassz a listából, vagy hagyd üresen.',
          name: 'Add meg a neved.',
          email: 'Add meg az e-mail-címed, hogy válaszolhassak.',
        },
        tooShort: 'Legalább {min} karakter kell ide.',
        tooLong: 'Legfeljebb {max} karakter lehet.',
        invalidEmail: 'Ez nem tűnik érvényes e-mail-címnek. Nézd meg, hogy van-e benne @ jel, és utána egy tartomány.',
        invalidPhone: 'Számokat, szóközt és a + ( ) - . / jeleket használhatsz, legalább 6 számjeggyel.',
        consentRequired: 'A küldéshez ezt be kell jelölnöd.',
      },
      actions: {
        next: 'Tovább',
        back: 'Vissza',
        send: 'Ajánlatkérés elküldése',
        prepare: 'Összegzés elkészítése',
        sending: 'Küldés…',
      },
      summary: {
        title: 'Ajánlatkérés',
        heading: 'Összegzés',
        reviewHint: 'Nézd át, mielőtt továbbmész.',
        empty: '—',
        labels: {
          projectType: 'Projekt típusa',
          package: 'Csomag',
          description: 'Leírás',
          reference: 'Meglévő oldal vagy referencia',
          budget: 'Költségkeret',
          timing: 'Időzítés',
          name: 'Név',
          email: 'E-mail',
          phone: 'Telefon',
          language: 'Nyelv',
        },
      },
      unavailable: {
        notice:
          'Az online beküldés még nincs bekötve. Kitöltheted a kérdéseket, de a kérés innen most nem tud elmenni: a végén az összegzést kimásolhatod.',
        title: 'Az ajánlatkérés nem lett elküldve',
        text: 'Az online beküldés még nincs beállítva, ezért semmi nem ment el. A válaszaid itt maradtak: másold ki az összegzést, és küldd el másik úton.',
        copy: 'Összegzés másolása',
        copied: 'Az összegzés a vágólapon van.',
        copyFailed: 'A másolás nem sikerült. Jelöld ki és másold ki kézzel az alábbi szöveget.',
        mail: 'Megnyitás e-mail-vázlatként',
        mailNote: 'Megnyílik az e-mail-programod egy vázlattal; csak akkor megy el, ha ott elküldöd.',
        subject: 'Ajánlatkérés',
      },
      failed: {
        title: 'Nem sikerült elküldeni',
        network: 'Nem értem el a szolgáltatást. Az adataid itt maradtak; ellenőrizd a kapcsolatot, és próbáld újra.',
        timeout:
          'A küldés túl sokáig tartott, ezért nem tudom, megérkezett-e. Az adataid itt maradtak; próbáld újra később.',
        rejected: 'A szolgáltatás nem fogadta el a kérést. Az adataid itt maradtak; próbáld újra később.',
      },
      sent: {
        title: 'Elküldve',
        text: 'Az ajánlatkérésed elküldve. A megadott e-mail-címen jelentkezem.',
        again: 'Új ajánlatkérés',
      },
    },
    process: {
      title: 'Hogyan dolgozunk együtt?',
      intro: 'Öt lépés az ötlettől az átadásig.',
    },
    faq: {
      title: 'Gyakori kérdések',
      intro: 'Őszinte, általános válaszok. Ha a kérdésed nincs köztük, írd le az ajánlatkérésben.',
    },
    final: {
      title: 'Van egy ötleted?',
      text: 'Nézzük meg, hogyan válhat belőle működő digitális termék.',
      cta: 'Kezdjük el',
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
      more: 'Többet rólam',
    },
    lab: {
      title: 'A Lab',
      intro: 'Kísérleti felület kreatív megoldásoknak: hat működő, interaktív WebGL-kísérlet és négy teljes 3D élmény. Három ízelítő itt, a teljes választék a Labban vár.',
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
