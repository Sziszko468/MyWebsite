import { tri, type Trilingual } from '../trilingual'

/**
 * "How we work together": five steps, in this order. Adjust them to the way the owner actually
 * works. The note under them is the page's only statement about deadlines and results: it makes no
 * promise, and says that whatever is agreed is written down in the quote.
 */

export interface ProcessStep {
  title: Trilingual
  text: Trilingual
}

export const processSteps: readonly ProcessStep[] = [
  {
    title: tri('Megbeszéljük az ötletet', 'We talk through the idea', 'We bespreken het idee'),
    text: tri(
      'Elmeséled, mit szeretnél létrehozni, és kinek. Kérdezek, hogy jól értsem.',
      'You tell me what you want to create and for whom. I ask questions so I understand it properly.',
      'Je vertelt wat je wilt maken en voor wie. Ik stel vragen om het goed te begrijpen.',
    ),
  },
  {
    title: tri('Pontosítjuk a célokat és a terjedelmet', 'We pin down the goals and the scope', 'We scherpen doelen en omvang aan'),
    text: tri(
      'Közösen leírjuk, mi tartozik a projektbe és mi nem. Az ajánlat erre épül; a pontos terjedelem itt véglegesedik.',
      'Together we write down what is in the project and what is not. The quote builds on that; the exact scope is settled here.',
      'Samen leggen we vast wat wel en niet bij het project hoort. De offerte bouwt daarop voort; hier wordt de exacte omvang vastgesteld.',
    ),
  },
  {
    title: tri('Elkészül a megállapodott terv és fejlesztés', 'The agreed plan and build take shape', 'Het afgesproken plan en de bouw komen tot stand'),
    text: tri(
      'A megállapodott terv alapján megtervezem és megépítem a megoldást.',
      'Based on the agreed plan, I design and build the solution.',
      'Op basis van het afgesproken plan ontwerp en bouw ik de oplossing.',
    ),
  },
  {
    title: tri('Teszteljük a megoldást', 'We test the solution', 'We testen de oplossing'),
    text: tri(
      'Együtt átnézzük, hogy a megoldás azt tudja-e, amit megbeszéltünk, és javítjuk, ami nem.',
      'Together we check that the solution does what we agreed, and fix what does not.',
      'Samen controleren we of de oplossing doet wat we hebben afgesproken, en herstellen we wat dat niet doet.',
    ),
  },
  {
    title: tri('Átadás és továbbfejlesztés', 'Handover and further development', 'Oplevering en verdere ontwikkeling'),
    text: tri(
      'A megállapodás szerint átadom a munkát. Ha szükséges, külön megállapodással tovább fejlesztjük.',
      'I hand the work over as agreed. If needed, we develop it further by separate agreement.',
      'Ik lever het werk op zoals afgesproken. Indien nodig ontwikkelen we het verder volgens aparte afspraak.',
    ),
  },
]

export const processNote: Trilingual = tri(
  'A lépések a projekthez igazodnak. A projekt részleteinek ismerete előtt nem ígérek határidőt vagy eredményt; amiben megállapodunk, az az ajánlatban kerül rögzítésre.',
  'The steps adapt to the project. I do not promise a deadline or an outcome before I know the project’s details; what we agree is written down in the quote.',
  'De stappen passen zich aan het project aan. Ik beloof geen deadline of resultaat voordat ik de details van het project ken; wat we afspreken, leg ik vast in de offerte.',
)

/**
 * What happens after an inquiry is sent, in order. It follows the answer to "How does a project
 * start?" (faq.ts) and promises no reply time, price or deadline: only the order of things.
 */
export const afterInquirySteps: readonly ProcessStep[] = [
  {
    title: tri('Megérkezik a kérésed', 'Your request arrives', 'Je aanvraag komt binnen'),
    text: tri(
      'Elolvasom, amit választottál és leírtál.',
      'I read what you chose and wrote.',
      'Ik lees wat je hebt gekozen en geschreven.',
    ),
  },
  {
    title: tri('Válaszolok az e-mail-címedre', 'I reply to your email address', 'Ik antwoord op je e-mailadres'),
    text: tri(
      'Ha kérdésem van, ott teszem fel; telefonon csak akkor keresnélek, ha megadtad a számodat.',
      'If I have questions I ask them there; I would only call if you gave a phone number.',
      'Heb ik vragen, dan stel ik ze daar; ik bel alleen als je een telefoonnummer hebt opgegeven.',
    ),
  },
  {
    title: tri('Egyeztetünk a részletekről', 'We talk through the details', 'We bespreken de details'),
    text: tri(
      'Tisztázzuk a célokat és a terjedelmet; ez a folyamat második lépése.',
      'We clarify the goals and the scope; this is the second step of the process.',
      'We verduidelijken de doelen en de omvang; dit is de tweede stap van het proces.',
    ),
  },
  {
    title: tri('Ajánlatot kapsz', 'You receive a quote', 'Je ontvangt een offerte'),
    text: tri(
      'Az ajánlat rögzíti, amiben megállapodunk. Az ajánlatkérés nem megrendelés: nem kötelez semmire.',
      'The quote records what we agree. Asking for a quote is not placing an order: it commits you to nothing.',
      'De offerte legt vast wat we afspreken. Een offerte aanvragen is geen bestelling: het verplicht je tot niets.',
    ),
  },
]

/** How we stay in touch and work together: the same facts as the process above, said as promises of method, not of speed. */
export const collaboration: readonly ProcessStep[] = [
  {
    title: tri('Kommunikáció', 'Communication', 'Communicatie'),
    text: tri(
      'Az e-mail-címen tartjuk a kapcsolatot; hogy milyen gyakran és milyen csatornán egyeztetünk a projekt alatt, az elején közösen eldöntjük.',
      'We keep in touch by email; how often and through which channel we talk during the project is decided together at the start.',
      'We houden contact per e-mail; hoe vaak en via welk kanaal we tijdens het project overleggen, beslissen we samen aan het begin.',
    ),
  },
  {
    title: tri('Együttműködés', 'Collaboration', 'Samenwerking'),
    text: tri(
      'A terjedelem leírva szerepel az ajánlatban, a megoldást együtt teszteljük, és ha valami változik, megbeszéljük, mielőtt továbbmennénk.',
      'The scope is written in the quote, we test the solution together, and if something changes we talk it through before going on.',
      'De omvang staat in de offerte, we testen de oplossing samen en als er iets verandert, bespreken we dat voordat we verdergaan.',
    ),
  },
]
