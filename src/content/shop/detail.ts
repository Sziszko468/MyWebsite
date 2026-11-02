import { tri } from '../trilingual'

/** The words of a service's product page (/services/website and the others). */

export const detail = {
  eyebrow: tri('Szolgáltatás', 'Service', 'Dienst'),
  pageIndex: tri('Ezen az oldalon', 'On this page', 'Op deze pagina'),
  sections: {
    overview: tri('Áttekintés', 'Overview', 'Overzicht'),
    get: tri('Amit kapsz', 'What you get', 'Wat je krijgt'),
    features: tri('Fő jellemzők', 'Key features', 'Belangrijkste kenmerken'),
    audience: tri('Kinek szól?', 'Who is it for?', 'Voor wie?'),
    how: tri('Hogyan működik', 'How it works', 'Hoe het werkt'),
    addons: tri('Választható kiegészítők', 'Available add-ons', 'Beschikbare toevoegingen'),
    work: tri('Kapcsolódó projektek', 'Related projects', 'Gerelateerde projecten'),
    faq: tri('Kérdések', 'Questions', 'Vragen'),
    price: tri('Ár vagy egyedi ajánlat', 'Pricing or custom quote', 'Prijs of offerte op maat'),
  },
  short: {
    overview: tri('Áttekintés', 'Overview', 'Overzicht'),
    get: tri('Eredmény', 'You get', 'Je krijgt'),
    features: tri('Jellemzők', 'Features', 'Kenmerken'),
    audience: tri('Kinek', 'Who for', 'Voor wie'),
    how: tri('Menet', 'How', 'Hoe'),
    addons: tri('Kiegészítők', 'Add-ons', 'Toevoegingen'),
    work: tri('Projektek', 'Projects', 'Projecten'),
    faq: tri('Kérdések', 'FAQ', 'Vragen'),
    price: tri('Ár', 'Price', 'Prijs'),
  },
  overview: {
    benefits: tri('Mit nyersz vele', 'What it gives you', 'Wat het je geeft'),
    useCases: tri('Tipikus projektek', 'Typical projects', 'Typische projecten'),
  },
  get: {
    intro: tri(
      'Ezt tartod a kezedben a végén. A pontos lista az ajánlatban szerepel.',
      'This is what you hold at the end. The exact list is written in the quote.',
      'Dit houd je aan het eind in handen. De exacte lijst staat in de offerte.',
    ),
  },
  features: {
    intro: tri(
      'Amit a szolgáltatás tartalmazhat. Nem minden projekthez kell mindegyik.',
      'What the service can include. Not every project needs all of it.',
      'Wat de dienst kan omvatten. Niet elk project heeft alles nodig.',
    ),
  },
  how: {
    intro: tri(
      'Ugyanaz az öt lépés minden szolgáltatásnál; a különbség a második lépésben van.',
      'The same five steps for every service; the difference is in the second step.',
      'Dezelfde vijf stappen voor elke dienst; het verschil zit in de tweede stap.',
    ),
    thisService: tri('Ennél a szolgáltatásnál', 'For this service', 'Bij deze dienst'),
  },
  addons: {
    intro: tri(
      'Mind választható. Jelöld be, ami kell: a kiválasztásod lent az összeállításba kerül.',
      'All optional. Tick what you want: your choice goes into the summary below.',
      'Allemaal optioneel. Vink aan wat je wilt: je keuze komt in het overzicht hieronder.',
    ),
    none: tri('Ehhez a szolgáltatáshoz nincs választható kiegészítő.', 'No add-ons are available for this service.', 'Voor deze dienst zijn geen toevoegingen beschikbaar.'),
    selected: tri('{count} kiválasztva', '{count} selected', '{count} geselecteerd'),
    legend: tri('Kiegészítők', 'Add-ons', 'Toevoegingen'),
  },
  work: {
    intro: tri(
      'Munkák a portfólióból, amelyek ezt a fajta feladatot mutatják.',
      'Work from the portfolio that shows this kind of task.',
      'Werk uit het portfolio dat dit soort taak laat zien.',
    ),
    look: tri('Mire érdemes nézni', 'What to look at', 'Waar je op kunt letten'),
    none: tri(
      'Ezt a munkát egyelőre egyik portfólióprojekt sem mutatja. Inkább ezt mondom ki, minthogy egy nem odaillő példát mutassak.',
      'No portfolio project shows this work yet. I would rather say so than show an example that does not fit.',
      'Dit werk wordt nog door geen portfolioproject getoond. Ik zeg dat liever dan een voorbeeld te laten zien dat niet past.',
    ),
    open: tri('Projekt megnyitása', 'Open the project', 'Project openen'),
  },
  faq: {
    intro: tri(
      'Rövid, őszinte válaszok erről a szolgáltatásról.',
      'Short, honest answers about this service.',
      'Korte, eerlijke antwoorden over deze dienst.',
    ),
  },
  price: {
    intro: tri(
      'A szolgáltatásnak nincs közzétett ára: a projekt terjedelméből indulunk ki, és egyedi ajánlatot kapsz. Az alábbi összeállítás kiindulópont, nem megrendelés.',
      'The service has no published price: we start from the scope of the project and you get a custom quote. The summary below is a starting point, not an order.',
      'De dienst heeft geen gepubliceerde prijs: we gaan uit van de omvang van het project en je krijgt een offerte op maat. Het overzicht hieronder is een startpunt, geen bestelling.',
    ),
    configTitle: tri('Állítsd össze', 'Put it together', 'Stel het samen'),
    packageLegend: tri('Melyik csomaggal kezdenél?', 'Which package would you start with?', 'Met welk pakket zou je beginnen?'),
    suggested: tri('Ajánlott ehhez', 'Suggested for this', 'Aanbevolen hiervoor'),
    summaryTitle: tri('Az összeállításod', 'Your selection', 'Je selectie'),
    summaryPackage: tri('Csomag', 'Package', 'Pakket'),
    summaryAddons: tri('Kiegészítők', 'Add-ons', 'Toevoegingen'),
    summaryPrice: tri('Ár', 'Price', 'Prijs'),
    noPackage: tri('Még nincs csomag kiválasztva', 'No package chosen yet', 'Nog geen pakket gekozen'),
    noAddons: tri('Nincs kiegészítő', 'No add-ons', 'Geen toevoegingen'),
    note: tri(
      'Az összeállítás módosítható a kosárban és az összeállítóban is.',
      'You can still change it in the cart and in the request builder.',
      'Je kunt het nog wijzigen in de winkelmand en in de aanvraagbouwer.',
    ),
    added: tri('A kosárban', 'In your cart', 'In je winkelmand'),
    changed: tri('Módosítottad: a kosár frissítéséhez kattints a gombra.', 'You changed it: press the button to update the cart.', 'Je hebt iets gewijzigd: druk op de knop om de winkelmand bij te werken.'),
  },
  sticky: {
    label: tri('Ajánlat kérése', 'Request a quote', 'Offerte aanvragen'),
    bar: tri('Ajánlatkérés: {name}', 'Quote request: {name}', 'Offerteaanvraag: {name}'),
  },
  final: {
    title: tri('Készen állsz?', 'Ready to start?', 'Klaar om te beginnen?'),
    text: tri(
      'Kérj egyedi ajánlatot, vagy nézd meg az összes szolgáltatást.',
      'Ask for a custom quote, or look at all the services.',
      'Vraag een offerte op maat aan of bekijk alle diensten.',
    ),
    cta: tri('Ajánlatot kérek', 'Request a quote', 'Offerte aanvragen'),
  },
  notFound: {
    title: tri('Ez a szolgáltatás nem található', 'This service was not found', 'Deze dienst is niet gevonden'),
  },
}
