import { tri } from '../trilingual'
import type { NeedId, PlanId } from '../services/ids'

/**
 * The shop's shared words: what every shop page and the header use. The shop's text is kept in
 * three languages side by side (`tri(hu, en, nl)`) and read through `useShopText()`, which picks
 * the visitor's language once for the whole structure. Starting copy for the owner to confirm.
 */

export const common = {
  nav: {
    label: tri('Bolt', 'Shop', 'Winkel'),
    services: tri('Szolgáltatások', 'Services', 'Diensten'),
    packages: tri('Csomagok', 'Packages', 'Pakketten'),
    fullExperience: tri('FULL EXPERIENCE', 'FULL EXPERIENCE', 'FULL EXPERIENCE'),
    configure: tri('Összeállító', 'Configure', 'Samenstellen'),
    cart: tri('Kosár', 'Cart', 'Winkelmand'),
    search: tri('Keresés', 'Search', 'Zoeken'),
    back: tri('Vissza a szolgáltatásokhoz', 'Back to Services', 'Terug naar Diensten'),
    breadcrumb: tri('Hol vagy', 'You are here', 'Je bent hier'),
    categories: tri('Szolgáltatáskategóriák', 'Service categories', 'Dienstencategorieën'),
    menuHeading: tri('Szolgáltatások boltja', 'The services shop', 'De dienstenwinkel'),
  },

  cartLink: {
    empty: tri('Kosár, üres', 'Cart, empty', 'Winkelmand, leeg'),
    one: tri('Kosár, 1 tétel', 'Cart, 1 item', 'Winkelmand, 1 item'),
    many: tri('Kosár, {count} tétel', 'Cart, {count} items', 'Winkelmand, {count} items'),
  },

  announce: {
    added: tri('{name} a kosárba került.', '{name} was added to your cart.', '{name} is toegevoegd aan je winkelmand.'),
    removed: tri('{name} kikerült a kosárból.', '{name} was removed from your cart.', '{name} is uit je winkelmand verwijderd.'),
    updated: tri('{name} frissítve a kosárban.', '{name} was updated in your cart.', '{name} is bijgewerkt in je winkelmand.'),
    cleared: tri('A kosár kiürítve.', 'Your cart was cleared.', 'Je winkelmand is geleegd.'),
  },

  price: {
    customQuote: tri('Egyedi ajánlat', 'Custom Quote', 'Offerte op maat'),
    quoteHint: tri(
      'Az ár a projekt terjedelmétől függ, és az ajánlatban szerepel.',
      'The price depends on the scope of the project and comes with the quote.',
      'De prijs hangt af van de omvang van het project en staat in de offerte.',
    ),
    from: tri('Ettől', 'From', 'Vanaf'),
    exact: tri('A pontos összeg az ajánlatban szerepel.', 'The exact amount is given in the quote.', 'Het exacte bedrag staat in de offerte.'),
    tbd: tri('Az ár még nincs megerősítve', 'Price to be confirmed', 'Prijs nog te bevestigen'),
    notPublished: tri('Nincs közzétett ár', 'No published price', 'Geen gepubliceerde prijs'),
    vat: {
      excluded: tri('+ ÁFA', '+ VAT', '+ btw'),
      included: tri('ÁFÁ-val', 'incl. VAT', 'incl. btw'),
      exempt: tri('ÁFA-mentes', 'VAT-exempt', 'btw-vrij'),
    },
    kind: {
      fixed: tri('Fix áras termék', 'Fixed-price product', 'Product met vaste prijs'),
      quote: tri('Egyedi ajánlat alapján', 'Custom-quoted service', 'Dienst op offerte'),
      addon: tri('Kiegészítő', 'Add-on', 'Toevoeging'),
    },
  },

  action: {
    addToCart: tri('Kosárba', 'Add to cart', 'In winkelmand'),
    inCart: tri('A kosárban', 'In your cart', 'In je winkelmand'),
    updateCart: tri('Kosár frissítése', 'Update cart', 'Winkelmand bijwerken'),
    viewCart: tri('Kosár megnyitása', 'View cart', 'Winkelmand bekijken'),
    requestQuote: tri('Ajánlatot kérek', 'Request a quote', 'Offerte aanvragen'),
    viewService: tri('Szolgáltatás megnézése', 'View service', 'Dienst bekijken'),
    configure: tri('Összeállítom', 'Build my request', 'Mijn aanvraag samenstellen'),
    letsTalk: tri('Beszéljünk', 'Let’s talk', 'Laten we praten'),
    choosePlan: tri('Ezt választom', 'Choose this', 'Kies dit'),
  },

  plans: {
    custom: {
      name: tri('Egyedi projekt', 'Custom project', 'Maatwerkproject'),
      tagline: tri(
        'Ha egyik csomag sem illik: leírod, mit szeretnél, és az ajánlat a projektre készül.',
        'If no package fits: you describe what you want and the quote is made for the project.',
        'Past geen pakket: jij beschrijft wat je wilt en de offerte wordt op het project gemaakt.',
      ),
    },
  },

  /** What the visitor can say they need: the first question of the configurator and the cart's line titles. */
  needs: {
    website: {
      title: tri('Új weboldal', 'New website', 'Nieuwe website'),
      text: tri('Bemutatkozó vagy tartalomközpontú oldal a nulláról.', 'An introductory or content-focused site from scratch.', 'Een introductie- of inhoudelijke site vanaf nul.'),
    },
    webapp: {
      title: tri('Webalkalmazás', 'Web application', 'Webapplicatie'),
      text: tri('Egyedi felhasználói folyamatokkal és adatkezeléssel.', 'With custom user flows and data handling.', 'Met maatwerk gebruikersflows en gegevensbeheer.'),
    },
    improve: {
      title: tri('Meglévő weboldal fejlesztése', 'Existing website improvement', 'Bestaande website verbeteren'),
      text: tri('Bővítés, javítás vagy továbbfejlesztés egy már működő oldalon.', 'Extending, fixing or developing a site that already runs.', 'Uitbreiden, herstellen of doorontwikkelen van een site die al draait.'),
    },
    ui: {
      title: tri('UI-megvalósítás', 'UI implementation', 'UI-implementatie'),
      text: tri('Meglévő designterv minőségi webes megvalósítása.', 'A quality web build of a design you already have.', 'Een hoogwaardige webuitwerking van een ontwerp dat je al hebt.'),
    },
    integrations: {
      title: tri('API-integráció', 'API integration', 'API-integratie'),
      text: tri('Szolgáltatások és rendszerek összekötése.', 'Connecting services and systems.', 'Diensten en systemen met elkaar verbinden.'),
    },
    unsure: {
      title: tri('Még nem tudom', 'Not sure yet', 'Nog niet zeker'),
      text: tri('Semmi baj: a kérdéseket együtt tisztázzuk.', 'That is fine: we work the questions out together.', 'Geen probleem: we zoeken de antwoorden samen uit.'),
    },
  } satisfies Record<NeedId, { title: unknown; text: unknown }>,

  /** Short names for a plan in summaries; the four packages are proper nouns and stay as they are. */
  planNames: {
    launch: tri('Launch', 'Launch', 'Launch'),
    grow: tri('Grow', 'Grow', 'Grow'),
    build: tri('Build', 'Build', 'Build'),
    care: tri('Care', 'Care', 'Care'),
    custom: tri('Egyedi projekt', 'Custom project', 'Maatwerkproject'),
  } satisfies Record<PlanId, unknown>,

  loading: tri('Betöltés…', 'Loading…', 'Laden…'),
  optional: tri('nem kötelező', 'optional', 'optioneel'),
  open: tri('Megnyitás', 'Open', 'Openen'),
  close: tri('Bezárás', 'Close', 'Sluiten'),
  newTab: tri('(új lapon nyílik)', '(opens in a new tab)', '(opent in een nieuw tabblad)'),
}
