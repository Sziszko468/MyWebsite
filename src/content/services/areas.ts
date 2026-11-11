import { overlayServiceAreas } from '../catalogOverlay'
import type { ProjectId } from '../projects'
import { tri, type Trilingual } from '../trilingual'
import type { ServiceId } from './ids'

/**
 * The service areas on the services page, in this order. Remove an entry to hide its block, edit
 * the feature lists freely, or add a project to `example` once one shows that kind of work.
 *
 * An area describes what is offered, not proven experience in it. A feature belongs on the list
 * only if the owner is willing to take it on; the "connecting services" summary says outright that
 * what can be connected is settled together before a quote. Each id doubles as the project type
 * that the area's quote button selects in the request builder.
 *
 * Written for people with no technical background (PROMPT 18): everyday words, short sentences, and a technical term only
 * where it is explained next to it.
 */

export interface ServiceArea {
  id: ServiceId
  name: Trilingual
  summary: Trilingual
  features: readonly Trilingual[]
  /**
   * A project from the portfolio that shows this kind of work, with one sentence on what to look
   * at. `null` when none does: the block then shows no example instead of a loose one.
   */
  example: { project: ProjectId; note: Trilingual } | null
}

export const baseServiceAreas: readonly ServiceArea[] = [
  {
    id: 'website',
    name: tri('Weboldalfejlesztés', 'Website Development', 'Website-ontwikkeling'),
    summary: tri(
      'Saját megjelenésű weboldalak, áttekinthető oldalszerkezettel, amely telefonon, tableten és számítógépen is jól működik.',
      'Websites with a look of their own, a clear page structure and a layout that works on phones, tablets and computers.',
      'Websites met een eigen uitstraling, een heldere paginastructuur en een opmaak die goed werkt op telefoon, tablet en computer.',
    ),
    features: [
      tri('Saját megjelenés', 'A look of your own', 'Een eigen uitstraling'),
      tri(
        'Áttekinthető oldalak és tartalom, hogy a látogatók megtalálják, amit keresnek',
        'Clear pages and content, so visitors find what they need',
        'Heldere pagina’s en inhoud, zodat bezoekers vinden wat ze zoeken',
      ),
      tri(
        'Elrendezés, amely a telefontól a számítógépig jól működik',
        'A layout that works from phone to computer',
        'Een opmaak die van telefoon tot computer goed werkt',
      ),
      tri(
        'Alapbeállítások a keresőkhöz, hogy megértsék az oldalad',
        'Basic settings for search engines, so they can understand your site',
        'Basisinstellingen voor zoekmachines, zodat die je site begrijpen',
      ),
      tri(
        'Világos és sötét téma, több nyelv, ha a projekt igényli',
        'A light and a dark theme and several languages, if the project needs them',
        'Een licht en een donker thema en meerdere talen, als het project dat vraagt',
      ),
    ],
    example: null,
  },
  {
    id: 'webapp',
    name: tri('Webalkalmazás-fejlesztés', 'Web Application Development', 'Webapplicatie-ontwikkeling'),
    summary: tri(
      'Böngészőben használható program, a te folyamatod köré építve: a képernyők, a lépések és az eltárolt adatok.',
      'Software that people use in their browser, built around your process: the screens, the steps and the information it keeps.',
      'Software die mensen in hun browser gebruiken, gebouwd rond jouw werkwijze: de schermen, de stappen en de gegevens die het bewaart.',
    ),
    features: [
      tri(
        'A felhasználók munkájához igazított képernyők és lépések',
        'Screens and steps made for how your users work',
        'Schermen en stappen die zijn gemaakt voor hoe je gebruikers werken',
      ),
      tri(
        'Hely az adataid tárolására és kezelésére',
        'A place to keep and manage your information',
        'Een plek om je gegevens te bewaren en te beheren',
      ),
      tri(
        'A látható felület és a háttérben működő rész, a megállapodott kereteken belül',
        'The part people see and the part behind the scenes, within the agreed scope',
        'Het deel dat mensen zien en het deel op de achtergrond, binnen de afgesproken omvang',
      ),
      tri(
        'Bejelentkezés és eltérő jogosultságok a különböző felhasználóknak, ha a projekt igényli',
        'Sign-in and different access for different users, if the project needs it',
        'Inloggen en verschillende rechten voor verschillende gebruikers, als het project dat vraagt',
      ),
      tri('Tesztelés az átadás előtt', 'Testing before handover', 'Testen vóór de oplevering'),
    ],
    example: {
      project: 'spendly',
      note: tri(
        'Teljes példa: a felület, amit az emberek látnak, mögötte egy szerver, és egy adatbázis, amely az információt tárolja.',
        'A complete example: the screens people see, a server behind them, and a database that keeps the information.',
        'Een compleet voorbeeld: de schermen die mensen zien, een server erachter en een database die de gegevens bewaart.',
      ),
    },
  },
  {
    id: 'ui',
    name: tri('Megvalósítás a terved alapján', 'Building from your design', 'Bouwen vanuit jouw ontwerp'),
    summary: tri(
      'Ha már van terved, weboldalt építünk belőle, amely minden képernyőn úgy néz ki és úgy viselkedik, ahogy megterveztétek.',
      'If you already have a design, we turn it into a website that looks and behaves as planned on every screen.',
      'Heb je al een ontwerp, dan bouwen we er een website van die op elk scherm eruitziet en werkt zoals gepland.',
    ),
    features: [
      tri(
        'A meglévő terved vagy tervrajzod követése',
        'Following the design or plan you already have',
        'Het ontwerp of plan volgen dat je al hebt',
      ),
      tri(
        'Működik a telefontól a számítógépig',
        'Works from phone to computer',
        'Werkt van telefoon tot computer',
      ),
      tri(
        'Újrahasználható építőelemek, hogy az új oldalak illeszkedjenek a többihez',
        'Reusable building blocks, so new pages match the rest',
        'Herbruikbare bouwstenen, zodat nieuwe pagina’s bij de rest passen',
      ),
      tri(
        'Mindenki számára használható: billentyűzet, olvasható színek, jól látható kijelölés',
        'Usable by everyone: keyboard use, readable colours, a clear highlight on the selected item',
        'Voor iedereen bruikbaar: toetsenbord, leesbare kleuren, een duidelijke markering van het gekozen onderdeel',
      ),
      tri(
        'Világos és sötét téma, ha a terv tartalmazza',
        'A light and a dark theme, if the design includes them',
        'Een licht en een donker thema, als het ontwerp die bevat',
      ),
    ],
    example: null,
  },
  {
    id: 'integrations',
    name: tri('Eszközök és szolgáltatások összekötése', 'Connecting your tools and services', 'Tools en diensten koppelen'),
    summary: tri(
      'Összekötjük a weboldalad azokkal az eszközökkel és szolgáltatásokkal, amelyeket már használsz, így kevesebb a kézi munka. Hogy megvalósítható-e, azt az ajánlat előtt közösen megnézzük.',
      'We connect your website to the tools and services you already use, helping reduce manual work. Whether a particular service can be connected is something we check together before a quote.',
      'We koppelen je website aan de tools en diensten die je al gebruikt, zodat je minder handwerk hebt. Of een bepaalde dienst gekoppeld kan worden, bekijken we samen vóór de offerte.',
    ),
    features: [
      tri(
        'A weboldal összekötése más szolgáltatásokkal',
        'Connecting your website to other services',
        'Je website koppelen aan andere diensten',
      ),
      tri(
        'Saját kapcsolat kiépítése, ha a projekt igényli',
        'Building a connection of our own, if the project needs one',
        'Een eigen koppeling bouwen, als het project dat vraagt',
      ),
      tri(
        'Az információ mozgatása a látható felület és a háttérrendszer között',
        'Moving information between what people see and what works behind the scenes',
        'Informatie verplaatsen tussen wat mensen zien en wat op de achtergrond werkt',
      ),
      tri(
        'Érthető üzenet a látogatónak, ha valami nem sikerül',
        'A clear message for the visitor when something goes wrong',
        'Een duidelijke melding voor de bezoeker als er iets misgaat',
      ),
    ],
    example: {
      project: 'spendly',
      note: tri(
        'Több külső szolgáltatás egy rendszerben: blokkok beolvasása fényképről, értesítések a telefonra és árfolyamok, amelyek kikapcsolhatók vagy lecserélhetők.',
        'Several outside services in one system: reading receipts from photos, notifications on the phone and exchange rates, which can be switched off or replaced.',
        'Meerdere externe diensten in één systeem: bonnen uit foto’s lezen, meldingen op de telefoon en wisselkoersen, die kunnen worden uitgezet of vervangen.',
      ),
    },
  },
]

/** The areas as the website shows them: the source's, with what the owner edited in the administration laid over it (content/catalogOverlay.ts). */
export const serviceAreas: readonly ServiceArea[] = [...overlayServiceAreas(baseServiceAreas)]
