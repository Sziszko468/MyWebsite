import { tri } from '../trilingual'

/**
 * The words of the package finder ("Not sure which package is right for you?", PROMPT 20): its questions, answers and the sentences
 * that explain a suggestion, in three languages. Plain language, one word per concept (add-on = kiegészítő / add-on / extra,
 * quote = ajánlat / quote / offerte). What each answer asks for is logic (src/shop/recommend.ts), not words; these words are
 * wording the administrator can change under Website texts.
 */

export const finder = {
  title: tri('Nem tudod, melyik csomag illik hozzád?', 'Not sure which package is right for you?', 'Weet je niet welk pakket bij je past?'),
  intro: tri(
    'Válaszolj négy rövid kérdésre. Javaslunk egy csomagot, és megmagyarázzuk, miért. Bármikor választhatsz másikat.',
    'Answer four short questions. We will suggest a package and explain why. You can always choose a different one.',
    'Beantwoord vier korte vragen. We stellen een pakket voor en leggen uit waarom. Je kunt altijd een ander pakket kiezen.',
  ),
  open: tri('Segíts választani', 'Help me choose', 'Help me kiezen'),
  close: tri('Bezárás', 'Close', 'Sluiten'),
  progress: tri('{current}. kérdés / {total}', 'Question {current} of {total}', 'Vraag {current} van {total}'),
  back: tri('Vissza', 'Back', 'Terug'),
  next: tri('Tovább', 'Next', 'Volgende'),
  skip: tri('Kihagyom', 'Skip', 'Overslaan'),
  show: tri('Javaslat megmutatása', 'Show my suggestion', 'Mijn voorstel tonen'),
  restart: tri('Újrakezdem', 'Start again', 'Opnieuw beginnen'),
  edit: tri('Válaszok módosítása', 'Change my answers', 'Antwoorden wijzigen'),

  questions: {
    scope: {
      title: tri('Mire van szükséged?', 'What do you need?', 'Wat heb je nodig?'),
      help: tri('Válaszd a legközelebbit.', 'Pick the closest one.', 'Kies wat er het dichtst bij komt.'),
      options: {
        simple: tri(
          'Egy egyszerű weboldal, amely bemutatja a vállalkozásomat',
          'A simple website that presents my business',
          'Een eenvoudige website die mijn bedrijf laat zien',
        ),
        richer: tri(
          'Egy weboldal több oldallal, és olyan részekkel, amelyeket a látogatók használhatnak',
          'A website with more pages and parts that visitors can use',
          'Een website met meer pagina’s en onderdelen die bezoekers kunnen gebruiken',
        ),
        application: tri(
          'Egy alkalmazás saját működéssel és tárolt információkkal',
          'An application with its own logic and stored information',
          'Een toepassing met een eigen werking en opgeslagen gegevens',
        ),
        unsure: tri('Még nem tudom', 'I am not sure yet', 'Dat weet ik nog niet'),
      },
    },
    existing: {
      title: tri('Van már weboldalad vagy alkalmazásod?', 'Do you already have a website or application?', 'Heb je al een website of toepassing?'),
      help: tri(
        'Ha van, olyan csomagot keresünk, amely a meglévőt fejleszti tovább.',
        'If you do, we look for a package that improves what you have.',
        'Als je er al een hebt, zoeken we een pakket dat verbetert wat je hebt.',
      ),
      options: {
        yes: tri('Igen, és fejleszteni szeretném', 'Yes, and I want to improve it', 'Ja, en ik wil hem verbeteren'),
        no: tri('Nem, ez új lenne', 'No, this would be new', 'Nee, het zou nieuw zijn'),
        unsure: tri('Nem vagyok biztos benne', 'I am not sure', 'Dat weet ik niet zeker'),
      },
    },
    stored: {
      title: tri(
        'Mentenie kell a weboldalnak információkat, például fiókokat, foglalásokat vagy rendeléseket?',
        'Should the website save information, for example accounts, bookings or orders?',
        'Moet de website gegevens bewaren, bijvoorbeeld accounts, boekingen of bestellingen?',
      ),
      help: tri(
        'Ehhez a weboldal mögötti rész is kell, ahol az információ biztonságosan tárolódik.',
        'This needs the part behind the scenes, where the information is kept safely.',
        'Daarvoor is ook het deel achter de schermen nodig, waar de gegevens veilig worden bewaard.',
      ),
      options: {
        yes: tri('Igen', 'Yes', 'Ja'),
        no: tri('Nem', 'No', 'Nee'),
        unsure: tri('Nem vagyok biztos benne', 'I am not sure', 'Dat weet ik niet zeker'),
      },
    },
    support: {
      title: tri(
        'Szeretnéd, hogy az indulás után mi gondoskodjunk róla?',
        'Do you want us to look after it after launch?',
        'Wil je dat wij er na de lancering voor zorgen?',
      ),
      help: tri('Frissítések, hibajavítások és kisebb módosítások.', 'Updates, fixes and small changes.', 'Updates, reparaties en kleine aanpassingen.'),
      options: {
        yes: tri('Igen, frissítésekkel és javításokkal', 'Yes, with updates and fixes', 'Ja, met updates en reparaties'),
        no: tri('Nem, magam intézem', 'No, I will manage it myself', 'Nee, dat regel ik zelf'),
        unsure: tri('Nem vagyok biztos benne', 'I am not sure', 'Dat weet ik niet zeker'),
      },
    },
  },

  result: {
    suggest: tri('Ezt javasoljuk: {package}', 'We suggest {package}', 'Wij stellen {package} voor'),
    also: tri('Érdemes megnézni még: {package}', 'Also worth a look: {package}', 'Ook de moeite waard: {package}'),
    whyTitle: tri('Miért ez a csomag', 'Why this package', 'Waarom dit pakket'),
    youNeed: tri('A válaszaid alapján erre van szükséged:', 'From your answers, you need:', 'Op basis van je antwoorden heb je dit nodig:'),
    includes: tri('A(z) {package} tartalmazza:', '{package} includes:', '{package} bevat:'),
    addon: tri('Nem kötelező kiegészítőként:', 'As an optional add-on:', 'Als optionele extra:'),
    custom: tri('Egyedi szolgáltatásként, külön ajánlattal:', 'As a custom service, quoted separately:', 'Als dienst op maat, apart geoffreerd:'),
    missing: tri('Nem része a csomagnak:', 'Not part of this package:', 'Hoort niet bij dit pakket:'),
    nothingMissing: tri('Mindent tartalmaz, amit kértél.', 'It includes everything you asked for.', 'Het bevat alles wat je vroeg.'),
    existing: tri(
      'Mivel már van weboldalad vagy alkalmazásod, csak a meglévő fejlesztésére szóló csomagokat vettük figyelembe.',
      'Because you already have a website or application, we only looked at packages that improve what exists.',
      'Omdat je al een website of toepassing hebt, hebben we alleen pakketten bekeken die iets bestaands verbeteren.',
    ),
    rule: tri(
      'A legkisebb olyan csomagot javasoljuk, amely a kért dolgok legalább négyötödét lefedi. Semmit nem küldünk el, és nem választunk helyetted.',
      'We suggest the smallest package that covers at least four fifths of what you asked for. Nothing is sent and nothing is chosen for you.',
      'We stellen het kleinste pakket voor dat minstens vier vijfde van je vragen dekt. Er wordt niets verstuurd en er wordt niets voor je gekozen.',
    ),
    fitTitle: tri('Mennyire illik az egyes csomag', 'How well each package fits', 'Hoe goed elk pakket past'),
    fit: tri('{package}: {percent} %', '{package}: {percent} %', '{package}: {percent} %'),
    choose: tri('A(z) {package} kiválasztása', 'Choose {package}', 'Kies {package}'),
    chosen: tri('{package} kiválasztva az összehasonlításban.', '{package} is selected in the comparison.', '{package} is gekozen in de vergelijking.'),
    start: tri('Kezdjük a(z) {package} csomaggal', 'Start with {package}', 'Begin met {package}'),
    seeAll: tri('Az összes csomag megtekintése', 'See all packages', 'Alle pakketten bekijken'),
    noneTitle: tri('Egy kicsit többet kell tudnunk', 'We need to know a little more', 'We moeten iets meer weten'),
    noneText: tri(
      'Mondd el az első kérdésben, mire van szükséged. Ha nem tudod, írd le a projektet, és mi segítünk.',
      'Tell us what you need in the first question. If you do not know yet, describe your project and we will help.',
      'Vertel in de eerste vraag wat je nodig hebt. Weet je het nog niet, beschrijf dan je project en wij helpen je.',
    ),
    describe: tri('Írd le a projektet', 'Describe your project', 'Beschrijf je project'),
  },
} as const
