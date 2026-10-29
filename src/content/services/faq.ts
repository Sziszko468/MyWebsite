import { tri, type Trilingual } from '../trilingual'

/**
 * The questions at the bottom of the services page, in this order. The answers are general and
 * meant to be edited: they set no binding price, guarantee or contract term, and they should keep
 * that character when they are rewritten. If a package gets a published price, revisit the second
 * answer.
 */

export interface FaqItem {
  id: string
  question: Trilingual
  answer: Trilingual
}

export const faq: readonly FaqItem[] = [
  {
    id: 'start',
    question: tri('Hogyan indul egy projekt?', 'How does a project start?', 'Hoe begint een project?'),
    answer: tri(
      'Az ajánlatkérő űrlap kitöltésével: megírod, mit szeretnél, és hogyan érhetlek el. Ezután egyeztetünk az ötletről és a célokról; ha a terjedelem tisztázódott, ajánlatot tudok adni.',
      'By filling in the quote request form: you tell me what you would like and how to reach you. Then we talk through the idea and the goals; once the scope is clear, I can give you a quote.',
      'Door het offerteformulier in te vullen: je vertelt wat je wilt en hoe ik je kan bereiken. Daarna bespreken we het idee en de doelen; als de omvang duidelijk is, kan ik een offerte geven.',
    ),
  },
  {
    id: 'cost',
    question: tri('Mennyibe kerül egy weboldal?', 'How much does a website cost?', 'Wat kost een website?'),
    answer: tri(
      'Ez a terjedelemtől függ: az oldalak és funkciók számától, a tartalom előkészítettségétől, az integrációktól és attól, hogy kell-e háttérrendszer. Ezért előre nem mondok fix árat; a projekt ismeretében készítek ajánlatot. A költségkeretedet az ajánlatkérésnél megadhatod, de nem kötelező.',
      'It depends on the scope: the number of pages and features, how ready the content is, any integrations, and whether a back end is needed. That is why I do not name a fixed price up front; I prepare a quote once I know the project. You can mention a budget in the quote request, but you do not have to.',
      'Dat hangt af van de omvang: het aantal pagina’s en functies, hoe ver de inhoud al is, eventuele integraties en of er een back-end nodig is. Daarom noem ik vooraf geen vaste prijs; ik maak een offerte zodra ik het project ken. Je kunt een budget noemen bij de offerteaanvraag, maar dat hoeft niet.',
    ),
  },
  {
    id: 'time',
    question: tri('Mennyi ideig tart a fejlesztés?', 'How long does development take?', 'Hoe lang duurt de ontwikkeling?'),
    answer: tri(
      'Attól függ, mekkora és mennyire összetett a projekt, és milyen gyorsan érkezik meg a szükséges tartalom és visszajelzés. Fix határidőt a részletek ismerete nélkül nem ígérek; amiben megállapodunk, az az ajánlatban szerepel.',
      'It depends on the size and complexity of the project and on how quickly the content and feedback come in. I do not promise a fixed deadline without knowing the details; whatever we agree is written in the quote.',
      'Dat hangt af van de grootte en complexiteit van het project en van hoe snel inhoud en feedback binnenkomen. Zonder de details te kennen beloof ik geen vaste deadline; wat we afspreken, staat in de offerte.',
    ),
  },
  {
    id: 'custom',
    question: tri('Lehet egyedi funkciókat kérni?', 'Can I ask for custom features?', 'Kan ik om maatwerkfuncties vragen?'),
    answer: tri(
      'Igen, érdemes leírni őket az ajánlatkérésben. Hogy egy funkció belefér-e a projektbe, a részletek ismeretében közösen döntjük el; előfordulhat, hogy valamit egyszerűsíteni vagy egy későbbi szakaszra halasztani kell.',
      'Yes, it is worth describing them in the quote request. Whether a feature fits within the project is decided together once the details are known; something may have to be simplified or moved to a later phase.',
      'Ja, beschrijf ze gerust bij de offerteaanvraag. Of een functie binnen het project past, bepalen we samen als de details bekend zijn; soms moet iets worden vereenvoudigd of naar een latere fase worden verschoven.',
    ),
  },
  {
    id: 'existing',
    question: tri(
      'Meglévő weboldalt is tovább tudok fejleszteni?',
      'Can an existing website be developed further?',
      'Kan een bestaande website verder worden ontwikkeld?',
    ),
    answer: tri(
      'Ez a meglévő megoldástól függ: először átnézem, hogyan készült, és mihez van hozzáférésem, majd közösen döntjük el, érdemes-e továbbfejleszteni vagy újraépíteni. A Grow és a Care csomag ilyen esetekre szól.',
      'That depends on what exists: I first look at how it was built and what I would have access to, and then we decide together whether to develop it further or rebuild it. The Grow and Care packages are meant for cases like this.',
      'Dat hangt af van wat er al is: ik kijk eerst hoe het is gebouwd en waar ik toegang toe zou hebben, en daarna beslissen we samen of we het verder ontwikkelen of opnieuw opbouwen. De pakketten Grow en Care zijn voor dit soort situaties bedoeld.',
    ),
  },
  {
    id: 'handover',
    question: tri(
      'Hogyan történik az átadás és a karbantartás?',
      'How do handover and maintenance work?',
      'Hoe werken oplevering en onderhoud?',
    ),
    answer: tri(
      'Az átadás módját és az azt követő támogatást a projekt elején egyeztetjük, és az ajánlatban rögzítjük. A folyamatos karbantartás nem automatikus: külön megállapodás tárgya (erre való a Care csomag).',
      'How the handover works and what support follows is agreed at the start of the project and written in the quote. Ongoing maintenance is not automatic: it is a separate agreement (that is what the Care package is for).',
      'Hoe de oplevering verloopt en welke ondersteuning daarna volgt, spreken we aan het begin van het project af en leggen we vast in de offerte. Doorlopend onderhoud is niet automatisch: het is een aparte afspraak (daar is het pakket Care voor).',
    ),
  },
]
