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
const UNSURE = tri('Még nem tudom: beszéljük meg', 'Not sure yet: let’s talk about it', 'Nog niet zeker: laten we het bespreken')

export const baseFullExperience: FullExperience = {
  hero: {
    eyebrow: tri('FULL EXPERIENCE', 'FULL EXPERIENCE', 'FULL EXPERIENCE'),
    headline: tri('AZ ÖTLETEDTŐL A KÉSZ DIGITÁLIS TERMÉKIG.', 'YOUR IDEA. BUILT FROM ZERO.', 'JOUW IDEE. VANAF NUL GEBOUWD.'),
    supporting: tri(
      'Van egy ötleted egy weboldalra vagy alkalmazásra? Mondd el, mire van szükséged. Segítünk megtervezni, kialakítani, felépíteni és elindítani.',
      'Have an idea for a website or an application? Tell us what you need. We will help plan it, design it, build it and launch it.',
      'Heb je een idee voor een website of een applicatie? Vertel ons wat je nodig hebt. We helpen het te plannen, te ontwerpen, te bouwen en live te zetten.',
    ),
    primaryCta: tri('Indítsuk el a projekted', 'Start Your Project', 'Start jouw project'),
    secondaryCta: tri('Nézd meg, mit tartalmaz', 'Explore What’s Included', 'Bekijk wat erbij zit'),
  },
  teaser: {
    title: tri('Az ötleted, nulláról felépítve', 'Your idea, built from zero', 'Jouw idee, vanaf nul gebouwd'),
    text: tri(
      'Teljes weboldalra vagy alkalmazásra van szükséged a nulláról, nem egy kész csomagra? Erre való ez a külön ajánlat: segítünk megtervezni, kialakítani, felépíteni és elindítani, a te igényeid köré.',
      'Need a complete website or application from scratch rather than one of the packages? This separate offer is for you. We help plan it, design it, build it and launch it, around what you need.',
      'Heb je geen pakket nodig, maar een complete website of applicatie vanaf nul? Dan is dit aparte aanbod voor jou. We helpen het te plannen, te ontwerpen, te bouwen en live te zetten, rond wat jij nodig hebt.',
    ),
  },
  priceLabel: tri('Egyedi ajánlat', 'Custom quote', 'Offerte op maat'),
  stages: [
    item('discovery', tri('Megismerjük az ötletet', 'Getting to know your idea', 'Je idee leren kennen'), tri('Megértjük az ötletet, a felhasználókat és az igényeket, mielőtt bármi elkészül.', 'We understand the idea, the users and what is needed before anything is built.', 'We begrijpen het idee, de gebruikers en wat nodig is voordat er iets wordt gebouwd.')),
    item('strategy', tri('Mi kerüljön az első változatba', 'What goes into the first version', 'Wat in de eerste versie komt'), tri('Eldöntjük, mi kerüljön az első változatba, és mi várhat.', 'We decide what belongs in the first version and what can wait.', 'We bepalen wat in de eerste versie hoort en wat kan wachten.')),
    item('ux', tri('A használat megtervezése', 'Planning how people will use it', 'Plannen hoe mensen het gebruiken'), tri('Megtervezzük, hogyan jutnak el az emberek a céljukig, és hogyan épülnek fel az oldalak.', 'We plan how people reach their goal, and how the pages are organised.', 'We plannen hoe mensen hun doel bereiken en hoe de pagina’s zijn opgebouwd.')),
    item('design', tri('A képernyők megtervezése', 'Designing the screens', 'De schermen ontwerpen'), tri('Megtervezzük, hogyan néz ki és hogyan működik minden képernyő, a márkádhoz igazítva.', 'We design how every screen looks and works, to fit your brand.', 'We ontwerpen hoe elk scherm eruitziet en werkt, passend bij je merk.')),
    item('system', tri('Egységes megjelenés', 'One consistent look', 'Één consistente uitstraling'), tri('Újrahasználható elemek, hogy minden oldal ugyanúgy nézzen ki.', 'Reusable pieces, so every page looks like it belongs.', 'Herbruikbare onderdelen, zodat elke pagina erbij hoort.')),
    item('frontend', tri('A látható felület elkészítése', 'Building what people see', 'Bouwen wat mensen zien'), tri('Megépítjük a felületet úgy, hogy minden eszközön működjön.', 'We build the screens so that they work on every device.', 'We bouwen de schermen zodat ze op elk apparaat werken.')),
    item('backend', tri('A háttérben működő rész elkészítése', 'Building what works behind the scenes', 'Bouwen wat op de achtergrond werkt'), tri('Az a rész, amely a háttérben dolgozik, a megállapodott kereteken belül.', 'The part that works behind the scenes, within the agreed scope.', 'Het deel dat op de achtergrond werkt, binnen de afgesproken omvang.')),
    item('database', tri('Az információ tárolásának megtervezése', 'Planning where your information is kept', 'Plannen waar je gegevens worden bewaard'), tri('Megtervezzük, hogyan lesz rendezve és eltárolva az információ.', 'We plan how the information is organised and stored.', 'We plannen hoe de gegevens worden geordend en opgeslagen.')),
    item('api', tri('Összekötés más szolgáltatásokkal', 'Connecting to other services', 'Koppelen met andere diensten'), tri('Összekötjük a felületet a háttérrendszerrel és a külső szolgáltatásokkal, ahol a projekt igényli.', 'We connect the screens to the part behind the scenes and to outside services where the project calls for it.', 'We verbinden de schermen met het deel op de achtergrond en met externe diensten waar het project dat vraagt.')),
    item('auth', tri('Bejelentkezés és jogosultságok', 'Sign-in and who can see what', 'Inloggen en wie wat mag zien'), tri('Bejelentkezés és eltérő hozzáférés a különböző felhasználóknak, ha a projekt igényli.', 'Sign-in and different access for different users, if the project needs it.', 'Inloggen en verschillende toegang voor verschillende gebruikers, als het project dat nodig heeft.')),
    item('admin', tri('Kezelőfelület neked', 'A place for you to manage things', 'Een plek waar jij dingen beheert'), tri('Egy felület, ahol a tartalmat és az adatokat kezelni tudod.', 'A place where you can manage the content and the information.', 'Een plek waar je de inhoud en de gegevens kunt beheren.')),
    item('mobile', tri('Telefonon is jól működik', 'Works well on phones', 'Werkt ook goed op telefoons'), tri('Először telefonra tervezve, aztán nagyobb képernyőkre bővítve.', 'Designed for the phone first, then extended to larger screens.', 'Eerst ontworpen voor de telefoon en daarna uitgebreid voor grotere schermen.')),
    item('testing', tri('Tesztelés', 'Testing', 'Testen'), tri('Az átadás előtt kipróbáljuk, hogy minden a megbeszélt módon működik.', 'Before handover we check that everything works as agreed.', 'Vóór de oplevering controleren we of alles werkt zoals afgesproken.')),
    item('performance', tri('Gyorsítás', 'Making it fast', 'Zorgen dat het snel is'), tri('Megmérjük a sebességet, és javítjuk a lassú pontokat.', 'We measure the speed and fix the slow spots.', 'We meten de snelheid en verhelpen de trage plekken.')),
    item('seo', tri('Megtalálható a keresőkben, mindenkinek használható', 'Easy to find in search engines, usable by everyone', 'Goed te vinden in zoekmachines en bruikbaar voor iedereen'), tri('Alapbeállítások a keresőknek, valamint billentyűzetes használat, olvasható színek és jól látható kijelölés.', 'Basic settings for search engines, plus keyboard use, readable colours and a clear highlight on the selected item.', 'Basisinstellingen voor zoekmachines, plus toetsenbordgebruik, leesbare kleuren en een duidelijke markering van het gekozen onderdeel.')),
    item('launch', tri('Élesítés', 'Launch', 'Livegang'), tri('A kész megoldás üzembe helyezése.', 'Putting the finished solution into use.', 'De afgeronde oplossing in gebruik nemen.')),
    item('docs', tri('Leírás az átadáskor', 'A written guide at handover', 'Een schriftelijke handleiding bij de oplevering'), tri('Az átadáskor leírjuk, hogyan épül fel a megoldás, és hogyan kezelheted.', 'At handover we write down how the solution is built and how you can manage it.', 'Bij de oplevering schrijven we op hoe de oplossing is opgebouwd en hoe je haar beheert.')),
    item('care', tri('Karbantartás az indulás után (opcionális)', 'Maintenance after launch (optional)', 'Onderhoud na de livegang (optioneel)'), tri('Külön megállapodással, a Care csomaghoz hasonlóan.', 'By separate agreement, like the Care package.', 'Via een aparte afspraak, zoals het pakket Care.')),
  ],
  components: [
    item('frontend', tri('Képernyők', 'Screens', 'Schermen'), tri('Az oldalak, gombok és elrendezés, amit az emberek látnak és használnak.', 'The pages, buttons and layout that people see and use.', 'De pagina’s, knoppen en opmaak die mensen zien en gebruiken.')),
    item('backend', tri('Háttérben működő rész', 'The part behind the scenes', 'Het deel op de achtergrond'), tri('A szabályok és folyamatok, amelyek a háttérben dolgoznak.', 'The rules and processes that work behind the scenes.', 'De regels en processen die op de achtergrond werken.')),
    item('database', tri('Információ tárolása', 'Keeping your information', 'Je gegevens bewaren'), tri('Hely az információnak, például ügyfeleknek, foglalásoknak vagy rendeléseknek.', 'A place for your information, such as customers, bookings or orders.', 'Een plek voor je gegevens, zoals klanten, boekingen of bestellingen.')),
    item('auth', tri('Bejelentkezés', 'Sign-in', 'Inloggen'), tri('Az emberek bejelentkeznek, és csak azt látják, ami rájuk tartozik.', 'People sign in and see only what is theirs.', 'Mensen loggen in en zien alleen wat bij hen hoort.')),
    item('admin', tri('Kezelőfelület', 'A place to manage things', 'Een beheerplek'), tri('Egy privát felület, ahol a tartalmat és az adatokat magad kezeled.', 'A private area where you manage the content and the information yourself.', 'Een privégedeelte waar je de inhoud en de gegevens zelf beheert.')),
    item('api', tri('Összekötés más szolgáltatásokkal', 'Links to other services', 'Koppelingen met andere diensten'), tri('Eszközök és szolgáltatások, amelyeket már használsz.', 'Tools and services you already use.', 'Tools en diensten die je al gebruikt.')),
    item('payments', tri('Online fizetés', 'Online payments', 'Online betalen'), tri('Ha a projektnek fizetésre van szüksége, ezt az ajánlat előtt tisztázzuk.', 'If the project needs payments, we settle that before the quote.', 'Heeft het project betalingen nodig, dan stemmen we dat af vóór de offerte.')),
    item('multilingual', tri('Több nyelv', 'More than one language', 'Meer dan één taal'), tri('Több nyelvi változat ugyanabban a szerkezetben.', 'Several language versions in one structure.', 'Meerdere taalversies in één structuur.')),
    item('interactive', tri('Animáció vagy 3D-hatások', 'Animation or 3D effects', 'Animatie of 3D-effecten'), tri('Mozgás és interakció ott, ahol segíti a használatot.', 'Movement and interaction where they help.', 'Beweging en interactie waar ze het gebruik helpen.')),
    item('mobile', tri('Telefonra tervezve', 'Made for phones first', 'Eerst gemaakt voor telefoons'), tri('Telefonra tervezve, nem csak hozzáigazítva.', 'Designed for the phone, not just adapted to it.', 'Ontworpen voor de telefoon, niet alleen eraan aangepast.')),
  ],
  faq: [
    {
      id: 'price',
      question: tri('Ez egy fix árú csomag?', 'Is this a fixed-price package?', 'Is dit een pakket met een vaste prijs?'),
      answer: tri(
        'Nem. A FULL EXPERIENCE egyedi szolgáltatás: az ajánlatot akkor készítjük el, amikor ismerjük az igényeidet, ezért itt nincs feltüntetett ár.',
        'No. FULL EXPERIENCE is a custom service: we write the quote once we know what you need, which is why no price is shown here.',
        'Nee. FULL EXPERIENCE is een dienst op maat: we stellen de offerte op als we weten wat je nodig hebt, daarom staat hier geen prijs.',
      ),
    },
    {
      id: 'types',
      question: tri('Milyen projektek lehetségesek?', 'What kinds of projects are possible?', 'Wat voor projecten zijn mogelijk?'),
      answer: tri(
        'Például céges weboldal, webáruház, webalkalmazás, belső üzleti alkalmazás vagy ügyfélportál. Ha az ötleted egyikbe sem illik, írd le: közösen kitaláljuk, mi fér bele.',
        'For example a business website, an online shop, a web application, an internal business tool or a customer portal. If your idea does not fit any of these, describe it and we will work out together what fits.',
        'Bijvoorbeeld een bedrijfswebsite, een webshop, een webapplicatie, een interne bedrijfsapplicatie of een klantenportaal. Past je idee in geen van deze, beschrijf het dan en we bepalen samen wat past.',
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
        'Az is elég a kezdéshez. Az első lépés az ismerkedés: közösen tisztázzuk, mit szeretnél, és mi fér bele.',
        'That is enough to begin. The first step is getting to know your idea: together we settle what you want and what fits.',
        'Dat is genoeg om te beginnen. De eerste stap is kennismaken met je idee: samen bepalen we wat je wilt en wat past.',
      ),
    },
    {
      id: 'info',
      question: tri('Mit kell elmondanom?', 'What do I need to tell you?', 'Wat moet ik jullie vertellen?'),
      answer: tri(
        'Elég néhány rövid kérdésre válaszolnod, és saját szavaiddal leírnod az ötletet. Add meg az elérhetőségedet is, hogy válaszolhassunk. Műszaki tudás nem kell: ami hiányzik, azt közösen kitaláljuk.',
        'You answer a few short questions and describe the idea in your own words. Add your contact details so we can reply. You do not need any technical knowledge: what is missing, we work out together.',
        'Je beantwoordt een paar korte vragen en beschrijft het idee in je eigen woorden. Laat je contactgegevens achter, zodat we kunnen antwoorden. Technische kennis is niet nodig: wat ontbreekt, bedenken we samen.',
      ),
    },
    {
      id: 'request',
      question: tri('Mi történik az ajánlatkérés után?', 'What happens after I send the request?', 'Wat gebeurt er nadat ik de aanvraag heb verstuurd?'),
      answer: tri(
        'Megkapjuk a válaszaidat, átnézzük őket, és a megadott e-mail-címen jelentkezünk. Az ajánlatkérés semmire nem kötelez.',
        'We receive your answers, read through them and get back to you at the email address you give. Sending the request commits you to nothing.',
        'We ontvangen je antwoorden, lezen ze door en nemen contact met je op via het e-mailadres dat je opgeeft. Het versturen van de aanvraag verplicht tot niets.',
      ),
    },
    {
      id: 'payment',
      question: tri('Kell fizetnem az ajánlatkérésért?', 'Do I have to pay anything when I send the request?', 'Moet ik iets betalen als ik de aanvraag verstuur?'),
      answer: tri(
        'Nem. Az ajánlatkérés semmire nem kötelez: nem rendelsz meg és nem fizetsz semmit. Először megkapod az egyedi ajánlatot, és csak utána döntesz.',
        'No. Sending the request commits you to nothing: you do not order or pay anything. You first receive a custom quote, and only then do you decide.',
        'Nee. Het versturen van de aanvraag verplicht tot niets: je bestelt of betaalt niets. Eerst ontvang je een offerte op maat en pas daarna beslis je.',
      ),
    },
  ],
  configurator: {
    intro: tri(
      'Néhány rövid kérdés, hogy lássuk, mit szeretnél létrehozni. A nem kötelezőket kihagyhatod, és bármikor visszaléphetsz.',
      'A few short questions to see what you want to create. You can skip the optional ones and go back at any time.',
      'Een paar korte vragen om te zien wat je wilt maken. Je kunt de optionele vragen overslaan en op elk moment teruggaan.',
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
          option('shop-site', tri('Webáruház', 'Online shop', 'Webshop')),
          option(
            'web-app',
            tri('Webalkalmazás', 'Web application', 'Webapplicatie'),
            false,
            tri('Olyan program, amelyet a böngészőben használnak, például egy foglalási rendszer.', 'Software people use in their browser, for example a booking system.', 'Software die mensen in hun browser gebruiken, bijvoorbeeld een boekingssysteem.'),
          ),
          option(
            'internal-app',
            tri('Belső üzleti alkalmazás', 'Internal business tool', 'Interne bedrijfsapplicatie'),
            false,
            tri('Egy eszköz a saját csapatodnak vagy cégednek.', 'A tool for your own team or company.', 'Een tool voor je eigen team of bedrijf.'),
          ),
          option(
            'portal',
            tri('Ügyfélportál', 'Customer portal', 'Klantenportaal'),
            false,
            tri('Egy hely, ahol az ügyfeleid bejelentkezve látják a saját információikat.', 'A place where your customers sign in and see their own information.', 'Een plek waar je klanten inloggen en hun eigen gegevens zien.'),
          ),
          option(
            'custom',
            tri('Egyedi digitális termék', 'Custom digital product', 'Digitaal product op maat'),
            false,
            tri('Ha egyik sem illik rá, a leírásnál elmondhatod.', 'If none of these fit, you can explain in the description.', 'Past geen van deze, dan leg je het uit bij de beschrijving.'),
          ),
          option('unsure', tri('Még nem tudom', 'Not sure yet', 'Nog niet zeker'), true),
        ],
      },
      {
        id: 'stage',
        kind: 'single',
        required: true,
        title: tri('Hol tart most a projekt?', 'Where is the project now?', 'Waar staat het project nu?'),
        help: EMPTY,
        options: [
          option('idea', tri('Egyelőre csak egy ötlet', 'Just an idea', 'Alleen nog een idee')),
          option('requirements', tri('Már leírtam, mire van szükségem', 'I have already written down what I need', 'Ik heb al opgeschreven wat ik nodig heb')),
          option('design', tri('Már van terv vagy látványterv', 'I already have a design', 'Ik heb al een ontwerp')),
          option('redevelopment', tri('Egy meglévő alkalmazást újra kell építeni', 'An existing application needs to be rebuilt', 'Een bestaande applicatie moet opnieuw worden gebouwd')),
          option('extension', tri('Egy meglévő rendszert új funkcióval kell bővíteni', 'An existing system needs a new feature', 'Een bestaand systeem heeft een nieuwe functie nodig')),
        ],
      },
      {
        id: 'components',
        kind: 'multi',
        required: false,
        title: tri('Mire van szükséged? (többet is választhatsz)', 'What does your project need? (choose any)', 'Wat heeft je project nodig? (kies er meerdere)'),
        help: tri('Ha nem vagy biztos benne, hagyd üresen: közösen kitaláljuk.', 'If you are not sure, leave it empty: we will work it out together.', 'Weet je het niet zeker, laat het leeg: we zoeken het samen uit.'),
        options: [
          option('frontend', tri('Képernyők, amelyeket az emberek látnak', 'Screens that people see and use', 'Schermen die mensen zien en gebruiken'), false, tri('Az oldalak, gombok és elrendezés.', 'The pages, buttons and layout.', 'De pagina’s, knoppen en opmaak.')),
          option('backend', tri('Háttérben működő szabályok és folyamatok', 'Rules and processes behind the scenes', 'Regels en processen op de achtergrond'), false, tri('Például számítások vagy egy foglalás feldolgozása.', 'For example calculations, or handling a booking.', 'Bijvoorbeeld berekeningen of het verwerken van een boeking.')),
          option('database', tri('Információ tárolása és kezelése', 'Saving and managing information', 'Gegevens opslaan en beheren'), false, tri('Például ügyfelek, foglalások vagy rendelések.', 'For example customers, bookings or orders.', 'Bijvoorbeeld klanten, boekingen of bestellingen.')),
          option('auth', tri('Bejelentkezés a felhasználóknak', 'Sign-in for your users', 'Inloggen voor je gebruikers'), false, tri('Az emberek bejelentkeznek, és csak a saját dolgaikat látják.', 'People sign in and see only their own things.', 'Mensen loggen in en zien alleen hun eigen zaken.')),
          option('admin', tri('Hely, ahol te kezeled a tartalmat', 'A place where you manage the content', 'Een plek waar jij de inhoud beheert'), false, tri('Egy privát felület, ahol magad módosíthatsz dolgokat.', 'A private area where you can change things yourself.', 'Een privégedeelte waar je zelf dingen kunt aanpassen.')),
          option('api', tri('Összekötés más szolgáltatásokkal', 'Connecting to other services', 'Koppelen met andere diensten'), false, tri('Eszközök vagy szolgáltatások, amelyeket már használsz.', 'Tools or services you already use.', 'Tools of diensten die je al gebruikt.')),
          option('payments', tri('Online fizetés', 'Online payments', 'Online betalen'), false, tri('Ha fizetés is kell, ezt az ajánlat előtt tisztázzuk.', 'If payments are needed, we settle that before the quote.', 'Zijn betalingen nodig, dan stemmen we dat af vóór de offerte.')),
          option('multilingual', tri('Több nyelv', 'More than one language', 'Meer dan één taal')),
          option('interactive', tri('Animáció vagy 3D-hatások', 'Animation or 3D effects', 'Animatie of 3D-effecten'), false, tri('Mozgás és interakció, ahol segíti a használatot.', 'Movement and interaction where they help.', 'Beweging en interactie waar ze helpen.')),
          option('mobile', tri('Elsősorban telefonra készítve', 'Made for phones first', 'Eerst gemaakt voor telefoons')),
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
        help: tri('Itt nincs feltüntetett ár: az ajánlat az igényeid alapján készül. A válaszod csak a beszélgetést segíti.', 'No price is shown here: the quote is written from your needs. Your answer only helps the conversation.', 'Er staat hier geen prijs: de offerte wordt opgesteld op basis van wat je nodig hebt. Je antwoord helpt alleen het gesprek.'),
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
          option('month', tri('Egy hónapon belül', 'Within a month', 'Binnen een maand')),
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
