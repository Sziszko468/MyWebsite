import type { DemoType } from '../../demos/ids'
import { tri, type Trilingual } from '../trilingual'

/**
 * What a project's page says about its demo (PROMPT 35): the entry band, and each demo's name and one-line summary. It is its own small file on purpose: the project's page
 * reads it, while the demo's other words (shell.ts, and the three demos' own) load only with a demo page.
 */

export const demoEntry = {
  entry: {
    title: tri('Próbáld ki', 'Try it', 'Probeer het'),
    kicker: tri('Interaktív bemutató', 'Interactive demonstration', 'Interactieve demonstratie'),
    open: tri('Bemutató megnyitása', 'Open the demo', 'Demo openen'),
    note: tri(
      'Kitalált mintaadatokkal, az oldalon belül fut. Semmi nem mentődik, és nem kapcsolódik a projekt valódi rendszeréhez.',
      'It runs on invented sample data inside this page. Nothing is saved, and it is not connected to the project’s real system.',
      'Het draait op verzonnen voorbeeldgegevens binnen deze pagina. Niets wordt opgeslagen en het is niet verbonden met het echte systeem van het project.',
    ),
  },

  kinds: {
    'finance-workbench': {
      name: tri('Tranzakciók és költségkeretek', 'Transactions and budgets', 'Transacties en budgetten'),
      summary: tri(
        'Vegyél fel egy tranzakciót, szűrd és rendezd a listát, és nézd, ahogy a havi költségkeretek és a kategóriák szerinti kiadás követi.',
        'Add a transaction, filter and sort the list, and watch the monthly budgets and the spending by category follow.',
        'Voeg een transactie toe, filter en sorteer de lijst en zie hoe de maandbudgetten en de uitgaven per categorie meebewegen.',
      ),
    },
    'booking-flow': {
      name: tri('Időpontfoglalás', 'Booking flow', 'Boekingsflow'),
      summary: tri(
        'Válassz szolgáltatást, napot és időpontot, töltsd ki az űrlapot, és nézd meg, hogyan ellenőriz és foglal a felület. Valódi foglalás nem jön létre.',
        'Choose a service, a day and a time, fill in the form and see how the interface validates and books. No real booking is made.',
        'Kies een dienst, een dag en een tijd, vul het formulier in en zie hoe de interface controleert en boekt. Er wordt geen echte boeking gemaakt.',
      ),
    },
    'shipment-board': {
      name: tri('Szállítmánytábla', 'Shipment board', 'Zendingenbord'),
      summary: tri(
        'Lépj végig egy szállítmány munkafolyamatán különböző szerepkörökkel, és nézd, hogyan ellenőrzi a hozzárendelés a sofőr és a jármű okmányait.',
        'Move a shipment through its workflow as different roles, and see how assignment checks a driver’s and a truck’s papers.',
        'Laat een zending zijn workflow doorlopen als verschillende rollen en zie hoe de toewijzing de papieren van chauffeur en truck controleert.',
      ),
    },
  } satisfies Record<DemoType, { name: Trilingual; summary: Trilingual }>,
}
