import { tri, type Trilingual } from '../trilingual'

/**
 * FULL EXPERIENCE: the flagship offer, a complete website or application built from zero, from the first idea to the launch.
 * It is a custom service, never a package with a price: nothing here is a figure, a duration or a guarantee, and the page says
 * "custom quote". The website's own statement (this file) is the starting copy and what the backend is seeded from
 * (`npm run catalog:seed-export`); once the administrator edits it (Administration > Shop > FULL EXPERIENCE) the published copy
 * is laid over it (content/catalogOverlay.ts `overlayFullExperience`).
 *
 * The configurator is data: a list of questions, each with its options, so the owner can reword a question, change the
 * budget ranges (the budget question's options; there is always a "not sure yet"), add or remove an option or reorder them
 * without a build. The six core questions (`type`, `stage`, `components`, `complexity`, `budget`, `timeline`) cannot be removed.
 * The description and contact steps that follow the questions are fixed parts of the page, not of this document.
 */

export interface TitledText {
  id: string
  title: Trilingual
  text: Trilingual
}

export interface QuestionOption {
  id: string
  label: Trilingual
  hint: Trilingual
  /** "Not sure yet": the way out of a question the visitor cannot answer. */
  unsure: boolean
}

export interface Question {
  id: string
  kind: 'single' | 'multi'
  required: boolean
  title: Trilingual
  help: Trilingual
  options: QuestionOption[]
}

export interface FullExperience {
  hero: { eyebrow: Trilingual; headline: Trilingual; supporting: Trilingual; primaryCta: Trilingual; secondaryCta: Trilingual }
  teaser: { title: Trilingual; text: Trilingual }
  /** What stands where a price would; never a number. */
  priceLabel: Trilingual
  stages: TitledText[]
  components: TitledText[]
  faq: { id: string; question: Trilingual; answer: Trilingual }[]
  configurator: { intro: Trilingual; questions: Question[] }
}

/** The questions the configurator cannot do without. */
export const CORE_QUESTION_IDS = ['type', 'stage', 'components', 'complexity', 'budget', 'timeline'] as const

const EMPTY = tri('', '', '')
const option = (id: string, label: Trilingual, unsure = false, hint: Trilingual = EMPTY): QuestionOption => ({ id, label, hint, unsure })
const item = (id: string, title: Trilingual, text: Trilingual): TitledText => ({ id, title, text })
const UNSURE = tri('Még nem tudom: beszéljük meg', 'Not sure yet — let’s discuss it', 'Nog niet zeker: laten we het bespreken')

export const baseFullExperience: FullExperience = {
  hero: {
    eyebrow: tri('FULL EXPERIENCE', 'FULL EXPERIENCE', 'FULL EXPERIENCE'),
    headline: tri('AZ ÖTLETEDTŐL A KÉSZ DIGITÁLIS TERMÉKIG.', 'YOUR IDEA. BUILT FROM ZERO.', 'JOUW IDEE. VANAF NUL GEBOUWD.'),
    supporting: tri(
      'Teljes weboldal vagy alkalmazás fejlesztése nulláról. A koncepciótól és a tervezéstől a fejlesztésen át egészen az éles indulásig.',
      'From the first concept to a fully developed digital experience. One complete solution, designed, engineered, and delivered around your requirements.',
      'Van het eerste concept tot een volledig uitgewerkte digitale ervaring. Eén complete oplossing, ontworpen, ontwikkeld en opgeleverd rond jouw wensen.',
    ),
    primaryCta: tri('Indítsuk el a projekted', 'Start Your Project', 'Start jouw project'),
    secondaryCta: tri('Nézd meg, mit tartalmaz', 'Explore What’s Included', 'Bekijk wat erbij zit'),
  },
  teaser: {
    title: tri('Az ötletedtől a kész digitális termékig', 'Your idea, built from zero', 'Jouw idee, vanaf nul gebouwd'),
    text: tri(
      'Ha nem egy meglévő csomag, hanem egy teljes weboldal vagy alkalmazás kell nulláról, ez a külön ajánlat neked szól: a koncepciótól az éles indulásig, a követelményeid köré építve.',
      'If you need a complete website or application from scratch rather than one of the packages, this is the separate offer for you: from the concept to the launch, built around your requirements.',
      'Heb je geen pakket nodig maar een complete website of applicatie vanaf nul, dan is dit het aparte aanbod voor jou: van concept tot livegang, gebouwd rond jouw wensen.',
    ),
  },
  priceLabel: tri('Egyedi ajánlat', 'Custom quote', 'Offerte op maat'),
  stages: [
    item('discovery', tri('Feltárás és követelmények', 'Discovery & Requirements', 'Verkenning en eisen'), tri('Megértjük az ötletet, a felhasználókat és a követelményeket, mielőtt bármi elkészül.', 'Understanding the idea, the users and the requirements before anything is built.', 'Het idee, de gebruikers en de eisen begrijpen voordat er iets wordt gebouwd.')),
    item('strategy', tri('Termékstratégia', 'Product Strategy', 'Productstrategie'), tri('Eldöntjük, mi kerüljön az első változatba, és mi várhat.', 'Deciding what belongs in the first version and what can wait.', 'Bepalen wat in de eerste versie hoort en wat kan wachten.')),
    item('ux', tri('UX-kutatás és tervezés', 'UX Research & Planning', 'UX-onderzoek en planning'), tri('A felhasználói folyamatok és az oldalszerkezet megtervezése.', 'Planning the user flows and the structure of the pages.', 'De gebruikersstromen en de structuur van de pagina’s plannen.')),
    item('design', tri('UI/UX-tervezés', 'UI/UX Design', 'UI/UX-ontwerp'), tri('A felületek és az interakciók megtervezése, a márkához igazítva.', 'Designing the interfaces and interactions to fit the brand.', 'De interfaces en interacties ontwerpen, passend bij het merk.')),
    item('system', tri('Designrendszer', 'Design System', 'Designsysteem'), tri('Újrahasználható komponensek és tervezési alapelemek.', 'Reusable components and design tokens.', 'Herbruikbare componenten en designtokens.')),
    item('frontend', tri('Frontendfejlesztés', 'Frontend Development', 'Frontendontwikkeling'), tri('A felület elkészítése, amely minden eszközön használható.', 'Building the interface so that it works on every device.', 'De interface bouwen zodat die op elk apparaat werkt.')),
    item('backend', tri('Backendfejlesztés', 'Backend Development', 'Backendontwikkeling'), tri('A szerveroldali logika, a megállapodott keretek között.', 'The server-side logic, within the agreed scope.', 'De serverlogica, binnen de afgesproken omvang.')),
    item('database', tri('Adatbázis-architektúra', 'Database Architecture', 'Databasearchitectuur'), tri('Az adatok szerkezetének és tárolásának megtervezése.', 'Designing how the data is structured and stored.', 'Ontwerpen hoe de gegevens worden gestructureerd en opgeslagen.')),
    item('api', tri('API-fejlesztés és integrációk', 'API Development & Integrations', 'API-ontwikkeling en integraties'), tri('A felület és a háttérrendszer összekötése, külső szolgáltatások bekötése, ahol a projekt igényli.', 'Connecting the interface to the back end and to external services where the project calls for it.', 'De interface met de back-end en met externe diensten verbinden waar het project dat vraagt.')),
    item('auth', tri('Azonosítás és jogosultságkezelés', 'Authentication & Authorization', 'Authenticatie en autorisatie'), tri('Bejelentkezés és szerepkörök, ha a projektnek szüksége van rájuk.', 'Sign-in and user roles, if the project needs them.', 'Inloggen en gebruikersrollen, als het project ze nodig heeft.')),
    item('admin', tri('Adminisztrációs felület', 'Admin Dashboard', 'Beheeromgeving'), tri('Egy felület, amelyen a tartalmat és az adatokat kezelni lehet.', 'A place where the content and the data can be managed.', 'Een plek waar de inhoud en de gegevens beheerd kunnen worden.')),
    item('mobile', tri('Reszponzív, mobilra tervezett élmény', 'Responsive Mobile Experience', 'Responsieve mobiele ervaring'), tri('Mobilról indulva, telefontól az asztali gépig.', 'Designed from the phone up, to the desktop.', 'Ontworpen vanaf de telefoon, tot en met de desktop.')),
    item('testing', tri('Tesztelés és minőségbiztosítás', 'Testing & Quality Assurance', 'Testen en kwaliteitsborging'), tri('Az átadás előtt kipróbáljuk, hogy minden a megbeszéltek szerint működik.', 'Checking before handover that everything works as agreed.', 'Vóór de oplevering nagaan dat alles werkt zoals afgesproken.')),
    item('performance', tri('Teljesítmény-optimalizálás', 'Performance Optimization', 'Prestatie-optimalisatie'), tri('A sebesség mérése és a talált szűk keresztmetszetek javítása.', 'Measuring speed and fixing the bottlenecks found.', 'De snelheid meten en de gevonden knelpunten verhelpen.')),
    item('seo', tri('SEO és hozzáférhetőség', 'SEO & Accessibility', 'SEO en toegankelijkheid'), tri('Technikai SEO-alapok, billentyűzetes használat, kontraszt és fókuszjelzés.', 'Technical SEO basics, keyboard use, contrast and focus states.', 'Technische SEO-basis, toetsenbordgebruik, contrast en focusstatussen.')),
    item('launch', tri('Éles indulás', 'Deployment & Launch', 'Livegang'), tri('A kész rendszer üzembe helyezése.', 'Putting the finished system into use.', 'Het afgeronde systeem in gebruik nemen.')),
    item('docs', tri('Dokumentáció', 'Documentation', 'Documentatie'), tri('Az átadáskor leírjuk, hogyan épül fel és hogyan kezelhető a rendszer.', 'At handover, a description of how the system is built and how it is managed.', 'Bij de oplevering een beschrijving van hoe het systeem is opgebouwd en beheerd wordt.')),
    item('care', tri('Folyamatos karbantartás (opcionális)', 'Optional Ongoing Maintenance', 'Optioneel doorlopend onderhoud'), tri('Külön megállapodással a Care csomag szerint.', 'By separate agreement, as in the Care package.', 'Via een aparte afspraak, zoals in het Care-pakket.')),
  ],
  components: [
    item('frontend', tri('Frontend', 'Frontend', 'Frontend'), tri('A felület, amelyet a látogatók látnak.', 'The interface visitors see.', 'De interface die bezoekers zien.')),
    item('backend', tri('Backend', 'Backend', 'Backend'), tri('A szerveroldali logika.', 'The server-side logic.', 'De serverlogica.')),
    item('database', tri('Adatbázis', 'Database', 'Database'), tri('Az adatok tárolása és kezelése.', 'Storing and managing the data.', 'Het opslaan en beheren van de gegevens.')),
    item('auth', tri('Azonosítás', 'Authentication', 'Authenticatie'), tri('Bejelentkezés és szerepkörök.', 'Sign-in and user roles.', 'Inloggen en gebruikersrollen.')),
    item('admin', tri('Adminisztrációs felület', 'Admin dashboard', 'Beheeromgeving'), tri('A tartalom és az adatok kezelése.', 'Managing content and data.', 'Het beheren van inhoud en gegevens.')),
    item('api', tri('API-integrációk', 'API integrations', 'API-integraties'), tri('Külső szolgáltatások bekötése.', 'Connecting external services.', 'Externe diensten koppelen.')),
    item('payments', tri('Fizetési integráció', 'Payment integration', 'Betalingsintegratie'), tri('Ha a projekt fizetést igényel, ezt az igényt az ajánlat előtt tisztázzuk.', 'If the project needs payments, that is settled before the quote.', 'Heeft het project betalingen nodig, dan stemmen we dat af vóór de offerte.')),
    item('multilingual', tri('Többnyelvűség', 'Multilingual support', 'Meertalige ondersteuning'), tri('Több nyelvi változat ugyanabban a szerkezetben.', 'Several language versions in one structure.', 'Meerdere taalversies in één structuur.')),
    item('interactive', tri('3D / interaktív élmény', '3D / interactive experience', '3D / interactieve ervaring'), tri('Mozgás és interakció, ahol az segíti a használatot.', 'Motion and interaction where it helps the use.', 'Beweging en interactie waar het het gebruik helpt.')),
    item('mobile', tri('Mobilra fókuszáló élmény', 'Mobile-focused experience', 'Op mobiel gerichte ervaring'), tri('Telefonra tervezve, nem csak ahhoz igazítva.', 'Designed for the phone, not just adapted to it.', 'Ontworpen voor de telefoon, niet alleen eraan aangepast.')),
  ],
  faq: [
    {
      id: 'price',
      question: tri('Ez egy fix árú csomag?', 'Is this a fixed-price package?', 'Is dit een pakket met een vaste prijs?'),
      answer: tri(
        'Nem. A FULL EXPERIENCE egyedi szolgáltatás: az ajánlatot a követelményeid ismeretében készítjük el, ezért itt nincs feltüntetett ár.',
        'No. FULL EXPERIENCE is a custom service: the quote is written once your requirements are known, which is why no price is shown here.',
        'Nee. FULL EXPERIENCE is een dienst op maat: de offerte wordt opgesteld als jouw wensen bekend zijn, daarom staat hier geen prijs.',
      ),
    },
    {
      id: 'stages',
      question: tri('Kell minden szakaszra szükségem legyen?', 'Do I need every stage?', 'Heb ik alle fasen nodig?'),
      answer: tri(
        'Nem. A szakaszok és az összetevők a projekthez igazodnak: nem minden projekthez kell mindegyik, és amit nem kérsz, az nem része az ajánlatnak.',
        'No. The stages and components follow the project: not every project needs all of them, and what you do not ask for is not part of the quote.',
        'Nee. De fasen en onderdelen volgen het project: niet elk project heeft ze allemaal nodig en wat je niet vraagt, maakt geen deel uit van de offerte.',
      ),
    },
    {
      id: 'idea',
      question: tri('Mi van, ha csak egy ötletem van?', 'What if I only have an idea?', 'Wat als ik alleen een idee heb?'),
      answer: tri(
        'Az is elég a kezdéshez. Az első lépés a feltárás: közösen tisztázzuk, mit szeretnél, és mi férhet bele.',
        'That is enough to begin. The first step is discovery: together we settle what you want and what fits.',
        'Dat is genoeg om te beginnen. De eerste stap is de verkenning: samen bepalen we wat je wilt en wat past.',
      ),
    },
    {
      id: 'request',
      question: tri('Mi történik az ajánlatkérés után?', 'What happens after I send the request?', 'Wat gebeurt er nadat ik de aanvraag heb verstuurd?'),
      answer: tri(
        'Megkapjuk a válaszaidat, áttekintjük őket, és a megadott e-mail-címen jelentkezünk. Az ajánlatkérés semmire nem kötelez.',
        'We receive your answers, read through them and get back to you at the e-mail address you give. Sending the request commits you to nothing.',
        'We ontvangen je antwoorden, lezen ze door en nemen contact met je op via het e-mailadres dat je opgeeft. Het versturen van de aanvraag verplicht tot niets.',
      ),
    },
  ],
  configurator: {
    intro: tri(
      'Néhány rövid kérdés, hogy lássuk, mit szeretnél építeni. A nem kötelező kérdéseket kihagyhatod, és bármikor visszaléphetsz.',
      'A few short questions to see what you want to build. You can skip the optional ones and go back at any time.',
      'Een paar korte vragen om te zien wat je wilt bouwen. Je kunt de optionele vragen overslaan en op elk moment teruggaan.',
    ),
    questions: [
      {
        id: 'type',
        kind: 'single',
        required: true,
        title: tri('Milyen projektet szeretnél?', 'What kind of project is it?', 'Wat voor project is het?'),
        help: EMPTY,
        options: [
          option('business-site', tri('Céges weboldal', 'Business website', 'Bedrijfswebsite')),
          option('shop-site', tri('Webáruház', 'E-commerce website', 'Webshop')),
          option('web-app', tri('Webalkalmazás', 'Web application', 'Webapplicatie')),
          option('internal-app', tri('Belső üzleti alkalmazás', 'Internal business application', 'Interne bedrijfsapplicatie')),
          option('portal', tri('Ügyfélportál', 'Customer portal', 'Klantenportaal')),
          option('custom', tri('Egyedi digitális termék', 'Custom digital product', 'Digitaal product op maat')),
          option('unsure', tri('Még nem tudom', 'Not sure yet', 'Nog niet zeker'), true),
        ],
      },
      {
        id: 'stage',
        kind: 'single',
        required: true,
        title: tri('Hol tart a projekt?', 'Where is the project now?', 'Waar staat het project nu?'),
        help: EMPTY,
        options: [
          option('idea', tri('Egyelőre csak egy ötlet', 'Just an idea', 'Alleen nog een idee')),
          option('requirements', tri('A követelmények már megvannak', 'Requirements already defined', 'De eisen zijn al vastgelegd')),
          option('design', tri('A terv már megvan', 'Design already exists', 'Het ontwerp bestaat al')),
          option('redevelopment', tri('Meglévő alkalmazást kell újrafejleszteni', 'Existing application needs redevelopment', 'Een bestaande applicatie moet opnieuw ontwikkeld worden')),
          option('extension', tri('Meglévő rendszert kell új funkcióval bővíteni', 'Existing system needs additional functionality', 'Een bestaand systeem heeft extra functionaliteit nodig')),
        ],
      },
      {
        id: 'components',
        kind: 'multi',
        required: false,
        title: tri('Mire van szükség? (többet is választhatsz)', 'Which components are needed? (choose any)', 'Welke onderdelen zijn nodig? (kies er meerdere)'),
        help: tri('Ha nem vagy biztos benne, hagyd üresen: közösen kiderítjük.', 'If you are not sure, leave it empty: we will find out together.', 'Weet je het niet zeker, laat het leeg: we zoeken het samen uit.'),
        options: [
          option('frontend', tri('Frontend', 'Frontend', 'Frontend')),
          option('backend', tri('Backend', 'Backend', 'Backend')),
          option('database', tri('Adatbázis', 'Database', 'Database')),
          option('auth', tri('Azonosítás', 'Authentication', 'Authenticatie')),
          option('admin', tri('Adminisztrációs felület', 'Admin dashboard', 'Beheeromgeving')),
          option('api', tri('API-integrációk', 'API integrations', 'API-integraties')),
          option('payments', tri('Fizetési integráció', 'Payment integration', 'Betalingsintegratie')),
          option('multilingual', tri('Többnyelvűség', 'Multilingual support', 'Meertalige ondersteuning')),
          option('interactive', tri('3D / interaktív élmény', '3D / interactive experience', '3D / interactieve ervaring')),
          option('mobile', tri('Mobilra fókuszáló élmény', 'Mobile-focused experience', 'Op mobiel gerichte ervaring')),
        ],
      },
      {
        id: 'complexity',
        kind: 'single',
        required: false,
        title: tri('Mennyire összetett a projekt?', 'How complex is the project?', 'Hoe complex is het project?'),
        help: EMPTY,
        options: [
          option('simple', tri('Egyszerű', 'Simple', 'Eenvoudig')),
          option('medium', tri('Közepes', 'Medium', 'Gemiddeld')),
          option('complex', tri('Összetett', 'Complex', 'Complex')),
          option('unsure', tri('Nem vagyok biztos benne', 'Not sure', 'Niet zeker'), true),
        ],
      },
      {
        id: 'budget',
        kind: 'single',
        required: false,
        title: tri('Van elképzelésed a költségvetésről?', 'Do you have a budget in mind?', 'Heb je een budget in gedachten?'),
        help: tri('Nincs feltüntetett ár: az ajánlat a követelményeid alapján készül. A válaszod csak a beszélgetést segíti.', 'No price is shown here: the quote is written from your requirements. Your answer only helps the conversation.', 'Er staat hier geen prijs: de offerte wordt opgesteld op basis van jouw wensen. Je antwoord helpt alleen het gesprek.'),
        options: [
          option('fixed', tri('Van egy meghatározott keretem', 'I have a set budget', 'Ik heb een vast budget')),
          option('flexible', tri('A költségvetés rugalmas', 'My budget is flexible', 'Mijn budget is flexibel')),
          option('unsure', UNSURE, true),
        ],
      },
      {
        id: 'timeline',
        kind: 'single',
        required: false,
        title: tri('Mikorra szeretnéd?', 'When would you like it?', 'Wanneer wil je het hebben?'),
        help: tri('Ez a te elképzelésed, nem ígéret: az ütemezést az ajánlatban egyeztetjük.', 'This is what you would like, not a promise: the schedule is agreed in the quote.', 'Dit is wat jij wilt, geen belofte: de planning spreken we af in de offerte.'),
        options: [
          option('flexible', tri('Rugalmas', 'Flexible', 'Flexibel')),
          option('month', tri('Egy hónapon belül', 'Within 1 month', 'Binnen 1 maand')),
          option('quarter', tri('1–3 hónap', '1–3 months', '1–3 maanden')),
          option('half', tri('3–6 hónap', '3–6 months', '3–6 maanden')),
          option('unsure', tri('Még nem tudom', 'Not sure yet', 'Nog niet zeker'), true),
        ],
      },
    ],
  },
}

/** The offer the pages read. Laid over, in place, by the live catalogue (content/liveCatalog.ts). */
export const fullExperience: FullExperience = structuredClone(baseFullExperience)
