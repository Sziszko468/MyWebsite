import { tri } from '../trilingual'

/** The cart (/services/cart): the selection, edited, then turned into an inquiry. No payment takes place anywhere. */

export const cart = {
  eyebrow: tri('Kosár', 'Cart', 'Winkelmand'),
  title: tri('A kosarad', 'Your cart', 'Je winkelmand'),
  intro: tri(
    'Itt nincs fizetés. Összeállítod, mire van szükséged, ajánlatot kérsz, és egyedi ajánlatot kapsz.',
    'There is no payment here. You put together what you need, ask for a quote and receive a custom quote.',
    'Hier is geen betaling. Je stelt samen wat je nodig hebt, vraagt een offerte aan en krijgt een offerte op maat.',
  ),

  empty: {
    title: tri('A kosarad üres', 'Your cart is empty', 'Je winkelmand is leeg'),
    text: tri(
      'Válassz szolgáltatást, vagy állítsd össze a kérésed lépésről lépésre.',
      'Choose a service, or build your request step by step.',
      'Kies een dienst of stel je aanvraag stap voor stap samen.',
    ),
    browse: tri('Szolgáltatások megnézése', 'Browse services', 'Diensten bekijken'),
    configure: tri('Összeállítás indítása', 'Start building', 'Begin met samenstellen'),
  },

  groups: {
    fixed: tri('Fix áras termékek', 'Fixed-price products', 'Producten met vaste prijs'),
    quote: tri('Egyedi ajánlat alapján', 'Custom-quoted services', 'Diensten op offerte'),
    itemsLabel: tri('A kosár tételei', 'Cart items', 'Items in de winkelmand'),
  },
  legend: {
    title: tri('Mit jelentenek a címkék?', 'What the labels mean', 'Wat de labels betekenen'),
    fixed: tri('Közzétett ára van: az összeg látszik és összeadódik.', 'It has a published price: the amount is shown and added up.', 'Er is een gepubliceerde prijs: het bedrag wordt getoond en opgeteld.'),
    quote: tri('Nincs közzétett ára: az ajánlatban kapod meg.', 'It has no published price: you get it in the quote.', 'Er is geen gepubliceerde prijs: je krijgt die in de offerte.'),
    addon: tri('Választható kiegészítő egy szolgáltatáson.', 'An optional add-on on a service.', 'Een optionele toevoeging op een dienst.'),
  },

  line: {
    package: tri('Csomag', 'Package', 'Pakket'),
    packageFor: tri('Csomag ehhez: {name}', 'Package for {name}', 'Pakket voor {name}'),
    suggested: tri('ajánlott', 'suggested', 'voorgesteld'),
    notChosen: tri('Válassz csomagot', 'Choose a package', 'Kies een pakket'),
    addons: tri('Kiegészítők', 'Add-ons', 'Toevoegingen'),
    addonsSelected: tri('{count} kiválasztva', '{count} selected', '{count} gekozen'),
    price: tri('Ár', 'Price', 'Prijs'),
    addonsFor: tri('Kiegészítők ehhez: {name}', 'Add-ons for {name}', 'Toevoegingen voor {name}'),
    noAddons: tri('Ehhez nincs választható kiegészítő.', 'No add-ons are available for this one.', 'Hiervoor zijn geen toevoegingen beschikbaar.'),
    remove: tri('Eltávolítás', 'Remove', 'Verwijderen'),
    removeNamed: tri('{name} eltávolítása', 'Remove {name}', '{name} verwijderen'),
    view: tri('Szolgáltatás oldala', 'Service page', 'Dienstpagina'),
    needsPlan: tri('Csomag szükséges', 'Needs a package', 'Pakket nodig'),
  },

  summary: {
    title: tri('Összegzés', 'Summary', 'Overzicht'),
    services: tri('Szolgáltatások', 'Services', 'Diensten'),
    addons: tri('Kiegészítők', 'Add-ons', 'Toevoegingen'),
    fixedTotal: tri('Fix áras tételek összesen', 'Fixed-price total', 'Totaal vaste prijzen'),
    startingTotal: tri('Kezdőár összesen', 'Starting total', 'Totaal vanaf-prijzen'),
    quoted: tri('Az ajánlatban kapod meg', 'Priced in your quote', 'Prijs in je offerte'),
    quotedValue: tri('{count} tétel', '{count} items', '{count} items'),
    noPayment: tri(
      'Fizetés nincs. A kosár ajánlatkéréssé alakul; a végleges összeget az ajánlat tartalmazza.',
      'No payment is taken. The cart turns into a quote request; the final amount is in the quote.',
      'Er wordt niet betaald. De winkelmand wordt een offerteaanvraag; het uiteindelijke bedrag staat in de offerte.',
    ),
    open: tri('Összegzés megnyitása', 'Show the summary', 'Overzicht tonen'),
    countOne: tri('1 szolgáltatás', '1 service', '1 dienst'),
    countMany: tri('{count} szolgáltatás', '{count} services', '{count} diensten'),
    mobileTitle: tri('Összegzés ({count})', 'Summary ({count})', 'Overzicht ({count})'),
    needsPlan: tri('Először válassz csomagot ehhez: {name}.', 'First choose a package for {name}.', 'Kies eerst een pakket voor {name}.'),
  },

  actions: {
    continue: tri('Böngészés folytatása', 'Continue browsing', 'Verder kijken'),
    proceed: tri('Tovább az ajánlatkéréshez', 'Proceed to inquiry', 'Door naar de aanvraag'),
    proceedShort: tri('Ajánlatot kérek', 'Request a quote', 'Offerte aanvragen'),
    edit: tri('Szerkesztés a lépéseken át', 'Edit step by step', 'Stap voor stap bewerken'),
    clear: tri('Kosár ürítése', 'Clear cart', 'Winkelmand legen'),
    clearAsk: tri('Biztosan kiüríted a kosarat?', 'Clear the whole cart?', 'De hele winkelmand legen?'),
    clearYes: tri('Igen, ürítés', 'Yes, clear it', 'Ja, legen'),
    clearNo: tri('Megtartom', 'Keep it', 'Behouden'),
    undo: tri('Visszavonás', 'Undo', 'Ongedaan maken'),
  },
  notice: {
    removed: tri('{name} kikerült a kosárból.', '{name} was removed.', '{name} is verwijderd.'),
    cleared: tri('A kosár üres.', 'The cart is empty.', 'De winkelmand is leeg.'),
  },
}
