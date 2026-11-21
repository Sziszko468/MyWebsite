import type { DemoType } from '../../demos/ids'
import { tri, type Trilingual } from '../trilingual'

/**
 * The words around every interactive demo (PROMPT 35): the demo page's frame, its states and the honest account of what is real in the project and what is
 * simulated in the demo. (The entry on a project's page, and each demo's name and one-line summary, are in entry.ts: that file is read by the project's page, so it is small on purpose.) Each demo's own words live beside it (content/demos/finance.ts, booking.ts, shipments.ts).
 * The lists of "real" and "simulated" are fixed in code: the administration can add instructions, never remove a disclosure.
 */

export interface DemoKind {
  /** How to use it, in a sentence or two. */
  instructions: Trilingual
  /** What the project itself really does (read from its own repository), which the demo reproduces. */
  real: readonly Trilingual[]
  /** What is simulated or left out here. */
  simulated: readonly Trilingual[]
}

export const demoKinds: Record<DemoType, DemoKind> = {
  'finance-workbench': {
    instructions: tri(
      'Vegyél fel egy bevételt vagy kiadást az űrlapon (a hibás mezőket az űrlap jelzi), szűrd a listát típus, kategória, időszak vagy keresőszó szerint, és kattints a fejlécekre a rendezéshez. A költségkeretek jelzői az új kiadásokkal együtt változnak; 80 % fölött figyelmeztetnek, 100 % fölött túllépést jeleznek.',
      'Add an income or an expense with the form (it names the fields that are wrong), filter the list by type, category, period or a search word, and use the headers to sort. The budget bars move with each new expense: a warning from 80 %, over budget past 100 %.',
      'Voeg een inkomst of uitgave toe met het formulier (het benoemt de velden die niet kloppen), filter de lijst op type, categorie, periode of zoekwoord en sorteer met de kopjes. De budgetbalken bewegen mee met elke nieuwe uitgave: een waarschuwing vanaf 80 %, overschreden boven 100 %.',
    ),
    real: [
      tri(
        'Tranzakciók felvétele és törlése; keresés, szűrés típus, kategória és dátum szerint, rendezés és lapozás (a projekt dokumentációja szerint).',
        'Creating and deleting transactions; search, filter by type, category and date, sort and paginate (according to the project’s documentation).',
        'Transacties aanmaken en verwijderen; zoeken, filteren op type, categorie en datum, sorteren en pagineren (volgens de documentatie van het project).',
      ),
      tri(
        'A tíz alapértelmezett kategória, köztük a Fizetés bevételként.',
        'The ten default categories, with Salary as the income one.',
        'De tien standaardcategorieën, met Salaris als inkomstencategorie.',
      ),
      tri(
        'Havi költségkeretek: elköltött, maradék és felhasználás, figyelmeztetéssel 80 % fölött és túllépés jelzésével.',
        'Monthly budgets: spent, remaining and usage, with a warning from 80 % and an over-budget state.',
        'Maandbudgetten: uitgegeven, resterend en gebruik, met een waarschuwing vanaf 80 % en een status voor overschrijding.',
      ),
    ],
    simulated: [
      tri(
        'Minden adat kitalált mintaadat két képzeletbeli hónapra. Semmi nem valódi költés, és semmi nem a projekt eredménye.',
        'All data is invented sample data for two imaginary months. None of it is real spending, and none of it is a result of the project.',
        'Alle gegevens zijn verzonnen voorbeeldgegevens voor twee denkbeeldige maanden. Niets is echte besteding en niets is een resultaat van het project.',
      ),
      tri(
        'A számolás a böngésződben fut. A valódi alkalmazás az adatbázisban számol, rögzített számú lekérdezéssel.',
        'The calculations run in your browser. The real app computes them in its database with a fixed number of queries.',
        'De berekeningen draaien in je browser. De echte app rekent ze in zijn database uit met een vast aantal queries.',
      ),
      tri(
        'A keretek rögzített mintaértékek: a valódi webes alkalmazásban a keretek még csak megtekinthetők, létrehozásukhoz nincs űrlap.',
        'The budgets are fixed sample limits: in the real web app budgets can be viewed but there is no form to create them yet.',
        'De budgetten zijn vaste voorbeeldlimieten: in de echte webapp zijn budgetten te bekijken, maar er is nog geen formulier om ze aan te maken.',
      ),
      tri(
        'Egyetlen pénznem (EUR). A valódi alkalmazás hat pénznemet kezel ECB-árfolyamokkal; ezt itt nem utánoztuk.',
        'One currency (EUR). The real app handles six currencies with ECB rates; that is not reproduced here.',
        'Één valuta (EUR). De echte app verwerkt zes valuta’s met ECB-koersen; dat is hier niet nagebootst.',
      ),
      tri(
        'Nincs fiók, nincs mentés: semmi nem hagyja el az oldalt, és az újratöltéssel minden visszaáll.',
        'No account and nothing is saved: nothing leaves this page, and a reload brings everything back to the start.',
        'Geen account en niets wordt opgeslagen: niets verlaat deze pagina en een herlaad zet alles terug naar het begin.',
      ),
    ],
  },

  'booking-flow': {
    instructions: tri(
      'Válassz szolgáltatást, majd egy hétköznapot a mától számított időszakból, és egy szabad időpontot. Add meg a neved és egy e-mail-címet (nyugodtan kitalált adat), és küldd el. Az összefoglaló alatt a „Mintafoglalásaid” listában állapotot módosíthatsz.',
      'Choose a service, then a weekday from today on, and a free time. Enter a name and an email address (invented ones are fine) and submit. Below the summary, the “Your sample bookings” list lets you change a status.',
      'Kies een dienst, dan een werkdag vanaf vandaag en een vrije tijd. Vul een naam en een e-mailadres in (verzonnen gegevens zijn prima) en verstuur. Onder het overzicht kun je in de lijst “Je voorbeeldboekingen” een status wijzigen.',
    ),
    real: [
      tri(
        'A nyilvános foglalási űrlap: név, e-mail, szolgáltatás (hat mintaszolgáltatás időtartammal és árral), dátum mától és időpont; kötelező mezők és e-mail-formátum ellenőrzése, hibaüzenet, majd összefoglaló képernyő.',
        'The public booking form: name, email, service (six sample services with a duration and a price), a date from today and a time; required-field and email-format checks, an error message, then a summary screen.',
        'Het openbare boekingsformulier: naam, e-mail, dienst (zes voorbeelddiensten met duur en prijs), een datum vanaf vandaag en een tijd; controle op verplichte velden en e-mailformaat, een foutmelding en dan een samenvattingsscherm.',
      ),
      tri(
        'Az időpontlista állapotszűrővel és kereséssel, valamint az állapotváltás (ütemezett, teljesült, lemondott).',
        'The appointment list with a status filter and search, and status changes (scheduled, completed, cancelled).',
        'De afsprakenlijst met een statusfilter en zoeken, en statuswijzigingen (gepland, voltooid, geannuleerd).',
      ),
    ],
    simulated: [
      tri(
        'A szabad és foglalt időpontok mintaadatok. A valódi BookingHubban nincs szabadidőpont- vagy ütközés-ellenőrzés: ezt a szemléltetést a bemutató teszi hozzá, és nem a projekt funkciója.',
        'The free and taken times are sample data. The real BookingHub has no availability or conflict check: the demo adds this illustration, and it is not a feature of the project.',
        'De vrije en bezette tijden zijn voorbeeldgegevens. De echte BookingHub heeft geen beschikbaarheids- of conflictcontrole: de demo voegt deze illustratie toe en het is geen functie van het project.',
      ),
      tri(
        'Nem jön létre foglalás, és nem megy ki e-mail. A valódi alkalmazás a Resend szolgáltatáson át küld visszaigazolást, kulcs nélkül pedig csak szimulál.',
        'No appointment is created and no email is sent. The real app sends a confirmation through Resend, and only simulates it without a key.',
        'Er wordt geen afspraak aangemaakt en er gaat geen e-mail uit. De echte app verstuurt een bevestiging via Resend en simuleert die alleen zonder sleutel.',
      ),
      tri(
        'A mintafoglalások csak ezen az oldalon élnek, és az újratöltéssel eltűnnek. A szolgáltatások árai mintaértékek.',
        'The sample bookings live on this page only and disappear on reload. The services’ prices are sample values.',
        'De voorbeeldboekingen leven alleen op deze pagina en verdwijnen bij herladen. De prijzen van de diensten zijn voorbeeldwaarden.',
      ),
    ],
  },

  'shipment-board': {
    instructions: tri(
      'Válassz szerepkört, szűrd a szállítmányokat állapot szerint, nyiss meg egyet, és lépj vele: a lemondáshoz és a visszalépéshez indoklás kell. A „Hozzárendelés” panelen sofőrt és vontatót rendelhetsz hozzá; a lejárt okmányok és az átfedő szállítmányok miatt a rendszer elutasítja.',
      'Choose a role, filter the shipments by status, open one and move it on: cancelling and stepping back need a reason. In the assignment panel you can assign a driver and a truck; expired papers and overlapping shipments make it refuse.',
      'Kies een rol, filter de zendingen op status, open er een en zet hem door: annuleren en een stap terug vragen om een reden. In het toewijzingspaneel kun je een chauffeur en een trekker toewijzen; verlopen papieren en overlappende zendingen laten het weigeren.',
    ),
    real: [
      tri(
        'A munkafolyamat: NEW → ASSIGNED → LOADING → IN_TRANSIT → DELIVERED (vagy CANCELLED); lemondáshoz és visszalépéshez indoklás kell.',
        'The workflow: NEW → ASSIGNED → LOADING → IN_TRANSIT → DELIVERED (or CANCELLED); cancelling and stepping back need a reason.',
        'De workflow: NEW → ASSIGNED → LOADING → IN_TRANSIT → DELIVERED (of CANCELLED); annuleren en een stap terug vragen om een reden.',
      ),
      tri(
        'Ki melyik lépést teheti: az adminisztrátor és a diszpécser minden lépést, a sofőr csak előre és csak a saját szállítmányán, a könyvelő egyiket sem.',
        'Who may make which move: administrators and dispatchers every move, a driver only forward and only on their own shipment, an accountant none.',
        'Wie welke stap mag zetten: beheerders en planners elke stap, een chauffeur alleen vooruit en alleen op zijn eigen zending, een boekhouder geen.',
      ),
      tri(
        'A szabályokkal ellenőrzött hozzárendelés: az okmányok a kiszállítás napján érvényesek, nincs átfedő nyitott szállítmány, és semmi sincs a műhelyben.',
        'Rule-checked assignment: the papers are valid on the delivery day, no other open shipment overlaps, and nothing is in the workshop.',
        'Regelgecontroleerde toewijzing: de papieren zijn op de dag van levering geldig, geen andere open zending overlapt en niets staat in de werkplaats.',
      ),
      tri(
        'Kereshető, rendezhető, lapozható lista állapotszűrővel.',
        'A searchable, sortable, paged list with a status filter.',
        'Een doorzoekbare, sorteerbare, gepagineerde lijst met een statusfilter.',
      ),
    ],
    simulated: [
      tri(
        'Minden szállítmány, sofőr, vontató és dátum kitalált. A projekt valódi leírása szerint sincsenek ügyfelei, és minden adata fiktív.',
        'Every shipment, driver, truck and date is invented. By the project’s own description it has no customers and all of its data is fictional.',
        'Elke zending, chauffeur, trekker en datum is verzonnen. Volgens de eigen beschrijving van het project heeft het geen klanten en is alle data fictief.',
      ),
      tri(
        'A szabályok a böngésződben futnak mintaadatokon. A valódi platformon az API érvényesíti őket, és ő vezeti az előzményeket.',
        'The rules run in your browser on sample data. In the real platform the API enforces them and keeps the history.',
        'De regels draaien in je browser op voorbeeldgegevens. In het echte platform dwingt de API ze af en houdt hij de geschiedenis bij.',
      ),
      tri(
        'Egyszerűsített hozzárendelés: sofőr és vontató; a pótkocsi, a térképes útvonal és az élő frissítés kimaradt.',
        'A simplified assignment: driver and truck; the trailer, the map route and the live updates are left out.',
        'Een vereenvoudigde toewijzing: chauffeur en trekker; de oplegger, de kaartroute en de live updates zijn weggelaten.',
      ),
      tri(
        'Nincs szerver és nincs fiók: az újratöltéssel minden visszaáll.',
        'No server and no account: a reload brings everything back to the start.',
        'Geen server en geen account: een herlaad zet alles terug naar het begin.',
      ),
    ],
  },
}

export const demoText = {
  /** Labels that tell the visitor what they are looking at. They are drawn by the frame, so no demo can leave them out. */
  labels: {
    interactive: tri('Interaktív bemutató', 'Interactive demonstration', 'Interactieve demonstratie'),
    simulated: tri('Mintaadatok, szimuláció', 'Simulated data', 'Gesimuleerde gegevens'),
    notSaved: tri('Semmi nem mentődik és nem megy el', 'Nothing is saved or sent', 'Niets wordt opgeslagen of verstuurd'),
    real: tri('Valódi a projektben', 'Real in the project', 'Echt in het project'),
    simulatedList: tri('Itt szimulált vagy kimaradt', 'Simulated or left out here', 'Hier gesimuleerd of weggelaten'),
    sample: tri('Minta', 'Sample', 'Voorbeeld'),
  },

  frame: {
    back: tri('Vissza a projekthez', 'Back to the project', 'Terug naar het project'),
    backNamed: tri('← {name}', '← {name}', '← {name}'),
    heading: tri('{name}: interaktív bemutató', '{name}: interactive demo', '{name}: interactieve demo'),
    how: tri('Hogyan használd', 'How to use it', 'Zo gebruik je het'),
    about: tri('Mi valódi és mi szimulált', 'What is real and what is simulated', 'Wat is echt en wat gesimuleerd'),
    region: tri('A bemutató felülete', 'The demo’s workspace', 'De werkruimte van de demo'),
    restart: tri('Újraindítás', 'Restart', 'Opnieuw starten'),
    restarted: tri('A bemutató újraindult, a mintaadatok visszaálltak.', 'The demo has restarted; the sample data is back as it was.', 'De demo is opnieuw gestart; de voorbeeldgegevens zijn terug zoals ze waren.'),
    fullscreen: tri('Teljes képernyő', 'Full screen', 'Volledig scherm'),
    exitFullscreen: tri('Kilépés a teljes képernyőből', 'Exit full screen', 'Volledig scherm verlaten'),
    fullscreenOn: tri('Teljes képernyő bekapcsolva. Az Esc billentyű kilép belőle.', 'Full screen is on. Press Escape to leave it.', 'Volledig scherm staat aan. Druk op Escape om het te verlaten.'),
    fullscreenOff: tri('Teljes képernyő kikapcsolva.', 'Full screen is off.', 'Volledig scherm staat uit.'),
  },

  states: {
    loading: tri('A bemutató betöltése…', 'Loading the demo…', 'De demo wordt geladen…'),
    errorTitle: tri('A bemutató nem tudott elindulni', 'The demo could not start', 'De demo kon niet starten'),
    errorText: tri(
      'Valami hiba történt a betöltésekor. A projekt oldala és a weboldal többi része működik.',
      'Something went wrong while loading it. The project’s page and the rest of the site work.',
      'Er ging iets mis bij het laden. De pagina van het project en de rest van de site werken.',
    ),
    retry: tri('Újrapróbálom', 'Try again', 'Opnieuw proberen'),
    unsupportedTitle: tri('Ez a böngésző nem tudja futtatni a bemutatót', 'This browser cannot run the demo', 'Deze browser kan de demo niet uitvoeren'),
    unsupportedText: tri(
      'A bemutatóhoz a böngészőnek ismernie kell néhány alapvető nyelvi szolgáltatást, és ez a böngésző nem ismeri mindet. A projekt oldala a képernyőképekkel és a leírással így is elérhető.',
      'The demo needs a few basic language features that this browser does not have. The project’s page, with its screenshots and description, is still available.',
      'De demo heeft een paar basisfuncties van de taal nodig die deze browser niet heeft. De pagina van het project, met schermafbeeldingen en beschrijving, is nog beschikbaar.',
    ),
    missingTitle: tri('Ennek a projektnek nincs bemutatója', 'This project has no demo', 'Dit project heeft geen demo'),
    missingText: tri(
      'A bemutató nincs bekapcsolva, vagy ehhez a projekthez nem tartozik. A projekt oldala elérhető.',
      'The demo is switched off, or does not belong to this project. The project’s page is available.',
      'De demo staat uit of hoort niet bij dit project. De pagina van het project is beschikbaar.',
    ),
    noScript: tri(
      'A bemutatóhoz JavaScript kell. A projekt oldala nélküle is olvasható.',
      'The demo needs JavaScript. The project’s page can be read without it.',
      'De demo heeft JavaScript nodig. De pagina van het project is ook zonder te lezen.',
    ),
  },

} as const
