import type { DemoType } from '../../demos/ids'
import { tri, type Trilingual } from '../trilingual'

/**
 * What a demo page says in the browser's tab and in a search result or a share (PROMPT 35). It is its own small file on purpose: the head is built for every page of
 * the site, so this is read by the site's main code, while the demo's other words (content/demos/shell.ts and the three demos' own) load only with a demo or the entry.
 */
export const demoMeta: { title: Trilingual; descriptions: Record<DemoType, Trilingual> } = {
  title: tri('{name} — interaktív bemutató', '{name} — interactive demo', '{name} — interactieve demo'),
  descriptions: {
    'finance-workbench': tri(
      'Próbáld ki a Spendly tranzakciókezelését és havi költségkereteit kitalált mintaadatokon, közvetlenül az oldalon.',
      'Try the transactions and monthly budgets of Spendly on invented sample data, right on the page.',
      'Probeer de transacties en maandbudgetten van Spendly op verzonnen voorbeeldgegevens, meteen op de pagina.',
    ),
    'booking-flow': tri(
      'Próbáld ki a BookingHub foglalási folyamatát: szolgáltatás, időpont, ellenőrzés és összefoglaló mintaadatokkal, valódi foglalás nélkül.',
      'Try BookingHub’s booking flow: service, time, validation and summary on sample data, without making a real booking.',
      'Probeer de boekingsflow van BookingHub: dienst, tijd, controle en overzicht met voorbeeldgegevens, zonder een echte boeking te maken.',
    ),
    'shipment-board': tri(
      'Próbáld ki a Logistics Platform szállítmány-munkafolyamatát és szabályokkal ellenőrzött hozzárendelését kitalált mintaadatokon.',
      'Try the Logistics Platform’s shipment workflow and rule-checked assignment on invented sample data.',
      'Probeer de workflow voor zendingen en de regelgecontroleerde toewijzing van het Logistics Platform op verzonnen voorbeeldgegevens.',
    ),
  },
}
