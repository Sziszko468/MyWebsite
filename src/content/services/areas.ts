import type { ProjectId } from '../projects'
import { tri, type Trilingual } from '../trilingual'
import type { ServiceId } from './ids'

/**
 * The service areas on the services page, in this order. Remove an entry to hide its block, edit
 * the feature lists freely, or add a project to `example` once one shows that kind of work.
 *
 * An area describes what is offered, not proven experience in it. A feature belongs on the list
 * only if the owner is willing to take it on; the API & Integrations summary says outright that
 * what can be connected is settled together before a quote. Each id doubles as the project type
 * that the area's quote button selects in the configurator.
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

export const serviceAreas: readonly ServiceArea[] = [
  {
    id: 'website',
    name: tri('Weboldalfejlesztés', 'Website Development', 'Website-ontwikkeling'),
    summary: tri(
      'Modern, reszponzív weboldalak egyedi vizuális megjelenéssel, átgondolt tartalmi struktúrával és mobilbarát felülettel.',
      'Modern, responsive websites with a distinctive look, a considered content structure and a mobile-friendly interface.',
      'Moderne, responsieve websites met een eigen uitstraling, een doordachte inhoudsstructuur en een mobielvriendelijke interface.',
    ),
    features: [
      tri('Egyedi vizuális megjelenés', 'A distinctive visual design', 'Een eigen visuele vormgeving'),
      tri('Átgondolt oldal- és tartalomstruktúra', 'A considered page and content structure', 'Een doordachte pagina- en inhoudsstructuur'),
      tri('Reszponzív elrendezés mobiltól asztali gépig', 'A responsive layout from phone to desktop', 'Een responsieve opmaak van telefoon tot desktop'),
      tri('Alapvető technikai SEO és metaadatok', 'Basic technical SEO and metadata', 'Basis technische SEO en metadata'),
      tri(
        'Világos és sötét téma, több nyelv, ha a projekt igényli',
        'Light and dark themes and several languages, if the project needs them',
        'Licht en donker thema en meerdere talen, als het project dat vraagt',
      ),
    ],
    example: null,
  },
  {
    id: 'webapp',
    name: tri('Webalkalmazás-fejlesztés', 'Web Application Development', 'Webapplicatie-ontwikkeling'),
    summary: tri(
      'Interaktív webalkalmazások, felhasználói folyamatok, adatkezelés és a projekt követelményeihez igazított frontend–backend megoldások.',
      'Interactive web applications, user flows, data handling and frontend–backend solutions matched to the project’s requirements.',
      'Interactieve webapplicaties, gebruikersflows, gegevensbeheer en frontend–backend-oplossingen die aansluiten op de eisen van het project.',
    ),
    features: [
      tri('Egyedi felhasználói folyamatok és felületek', 'Custom user flows and interfaces', 'Maatwerk gebruikersflows en interfaces'),
      tri('Adatkezelés és adatbázis-integráció', 'Data handling and database integration', 'Gegevensbeheer en database-integratie'),
      tri(
        'Frontend és backend a megállapodott terjedelemben',
        'Frontend and backend within the agreed scope',
        'Frontend en backend binnen de afgesproken omvang',
      ),
      tri(
        'Bejelentkezés és szerepkörök, ha a projekt igényli',
        'Sign-in and user roles, if the project needs them',
        'Inloggen en gebruikersrollen, als het project dat vraagt',
      ),
      tri('Tesztelés az átadás előtt', 'Testing before handover', 'Testen vóór de oplevering'),
    ],
    example: {
      project: 'spendly',
      note: tri(
        'Teljes stackes példa: React-kliens, REST API és PostgreSQL adatbázis.',
        'A full-stack example: a React client, a REST API and a PostgreSQL database.',
        'Een full-stackvoorbeeld: een React-client, een REST API en een PostgreSQL-database.',
      ),
    },
  },
  {
    id: 'ui',
    name: tri('UI-megvalósítás', 'UI Implementation', 'UI-implementatie'),
    summary: tri(
      'Meglévő designok és tervek minőségi, reszponzív webes megvalósítása.',
      'Quality, responsive web implementation of existing designs and plans.',
      'Hoogwaardige, responsieve webimplementatie van bestaande ontwerpen en plannen.',
    ),
    features: [
      tri('Meglévő terv vagy design követése', 'Following an existing design or plan', 'Een bestaand ontwerp of plan volgen'),
      tri('Reszponzív megvalósítás mobiltól asztali gépig', 'Responsive implementation from phone to desktop', 'Responsieve implementatie van telefoon tot desktop'),
      tri('Újrahasználható komponensek és design tokenek', 'Reusable components and design tokens', 'Herbruikbare componenten en designtokens'),
      tri(
        'Hozzáférhetőség: billentyűzet, kontraszt, fókuszállapotok',
        'Accessibility: keyboard use, contrast, focus states',
        'Toegankelijkheid: toetsenbord, contrast, focusstatussen',
      ),
      tri(
        'Világos és sötét téma, ha a terv tartalmazza',
        'Light and dark themes, if the design includes them',
        'Licht en donker thema, als het ontwerp dat bevat',
      ),
    ],
    example: null,
  },
  {
    id: 'integrations',
    name: tri('API-k és integrációk', 'API & Integrations', 'API’s en integraties'),
    summary: tri(
      'API-k és digitális szolgáltatások összekapcsolása, ha ez a projekt követelményeihez illeszkedik. Hogy egy adott szolgáltatás bekötése megvalósítható-e, azt az ajánlat előtt közösen tisztázzuk.',
      'Connecting APIs and digital services where the project calls for it. Whether a particular service can be connected is something we settle together before a quote.',
      'API’s en digitale diensten met elkaar verbinden waar het project dat vraagt. Of een bepaalde dienst gekoppeld kan worden, stemmen we samen af vóór een offerte.',
    ),
    features: [
      tri('Külső API-k és szolgáltatások bekötése', 'Connecting external APIs and services', 'Externe API’s en diensten koppelen'),
      tri('Saját REST API tervezése a projekthez', 'Designing a REST API for the project', 'Een REST API voor het project ontwerpen'),
      tri(
        'Adatok mozgatása a felület és a háttérrendszer között',
        'Moving data between the interface and the back end',
        'Gegevens verplaatsen tussen de interface en de back-end',
      ),
      tri(
        'Hibák kezelése és érthető visszajelzés a felhasználónak',
        'Handling errors and giving the user clear feedback',
        'Fouten afhandelen en de gebruiker duidelijke feedback geven',
      ),
    ],
    example: {
      project: 'spendly',
      note: tri(
        'Külső szolgáltatások egy rendszerben: blokkolvasás (OCR), push-értesítések és ECB-árfolyamok, választható és cserélhető integrációként.',
        'External services in one system: receipt reading (OCR), push notifications and ECB exchange rates, as optional, swappable integrations.',
        'Externe diensten in één systeem: bonnen lezen (OCR), pushmeldingen en ECB-wisselkoersen, als optionele, uitwisselbare integraties.',
      ),
    },
  },
]
