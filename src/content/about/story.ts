import { tri, type Trilingual } from '../trilingual'

/**
 * The personal story on the About page. It rests on two facts the owner gave: they worked in
 * logistics before, and turned to IT and software development on purpose. Everything else is
 * deliberately general: no employer, no period, no result and no anecdote is named, and none
 * should be added unless the owner confirms it. Edit the words here; each is written in all
 * three languages side by side, so a missing translation fails the build.
 */

export const storyTitle: Trilingual = tri('A fejlődés nem egyenes vonal.', 'Growth is not a straight line.', 'Groei is geen rechte lijn.')

export const storyParagraphs: readonly Trilingual[] = [
  tri(
    'Korábban logisztikai területen dolgoztam, ma szoftverfejlesztéssel foglalkozom. A váltás nem sodródás volt, hanem tudatos döntés: az informatika és a szoftverfejlesztés felé fordultam.',
    'I used to work in logistics; today I work in software development. The change was not drift but a conscious decision: I turned towards IT and software development.',
    'Ik werkte eerder in de logistiek; nu houd ik me bezig met softwareontwikkeling. De overstap was geen toeval maar een bewuste keuze: ik koos voor IT en softwareontwikkeling.',
  ),
  tri(
    'Nem a nulláról indultam. Amit a logisztikában megtanultam, az nem maradt a múltban: átlátni a folyamatokat, szervezni, ügyfelekkel és csapattal egyeztetni, rendszerben gondolkodni. Ezekkel az eszközökkel nyúlok ma egy weboldal vagy egy webalkalmazás problémáihoz.',
    'I did not start from zero. What I learned in logistics did not stay in the past: seeing through processes, organising, aligning with customers and a team, thinking in systems. These are the tools I bring to the problems of a website or a web application today.',
    'Ik begon niet bij nul. Wat ik in de logistiek leerde, bleef niet in het verleden: processen doorzien, organiseren, afstemmen met klanten en een team, in systemen denken. Met die gereedschappen pak ik vandaag de problemen van een website of webapplicatie aan.',
  ),
  tri(
    'Egy jó fejlesztő nem csak kódot ír: megérti, kinek és mire épít, és úgy alakítja a megoldást, hogy az illeszkedjen a valós működéshez. Ebben a különböző szakmai háttér nem hátrány, hanem plusz nézőpont.',
    'A good developer does more than write code: they understand who they are building for and why, and shape the solution to fit how things really work. In that, a different professional background is not a disadvantage but an extra point of view.',
    'Een goede ontwikkelaar schrijft meer dan code: hij of zij begrijpt voor wie en waarom er gebouwd wordt, en vormt de oplossing naar de werkelijke gang van zaken. Daarbij is een andere beroepsachtergrond geen nadeel maar een extra gezichtspunt.',
  ),
]

/** The closing thought, set apart from the paragraphs. */
export const storyThought: Trilingual = tri(
  'A különböző területeken megszerzett tapasztalatok megtanítottak arra, hogy minden problémának több nézőpontja van. Ezt a szemléletet viszem tovább a fejlesztésben is.',
  'The experience I gained in different fields taught me that every problem has more than one point of view. I carry that outlook into development as well.',
  'De ervaring die ik in verschillende vakgebieden heb opgedaan, heeft me geleerd dat elk probleem meerdere gezichtspunten heeft. Die kijk neem ik ook mee in softwareontwikkeling.',
)

/**
 * What carries over from one field to the other, and how it shows in development. These are the
 * seven skills the owner named; the sentences say how each shapes the way they work, and claim no
 * achievement.
 */
export interface TransferableSkill {
  id: string
  name: Trilingual
  /** How it contributes to the way a developer thinks and works. */
  text: Trilingual
}

export const transferableSkills: readonly TransferableSkill[] = [
  {
    id: 'problem-solving',
    name: tri('Problémamegoldás', 'Problem solving', 'Probleemoplossing'),
    text: tri(
      'Egy hibánál, egy zavaros folyamatnál vagy egy lassú oldalnál is az okot keresem, nem a tünetet.',
      'With a bug, a confusing process or a slow page, I look for the cause, not the symptom.',
      'Bij een bug, een onduidelijk proces of een trage pagina zoek ik de oorzaak, niet het symptoom.',
    ),
  },
  {
    id: 'process',
    name: tri('Folyamatok átlátása', 'Seeing the whole process', 'Processen doorzien'),
    text: tri(
      'Látom, hogyan kapcsolódik egymáshoz egy folyamat minden lépése, ezért a felület a valódi működést követi.',
      'I can see how every step of a process connects, so the interface follows how things actually work.',
      'Ik zie hoe elke stap van een proces samenhangt, zodat de interface de werkelijke gang van zaken volgt.',
    ),
  },
  {
    id: 'organisation',
    name: tri('Szervezés', 'Organisation', 'Organisatie'),
    text: tri(
      'Rendbe teszem a feladatokat és a prioritásokat, így a fejlesztés átlátható és követhető marad.',
      'I put tasks and priorities in order, so development stays clear and easy to follow.',
      'Ik breng taken en prioriteiten in volgorde, zodat de ontwikkeling overzichtelijk en te volgen blijft.',
    ),
  },
  {
    id: 'communication',
    name: tri('Ügyfélkommunikáció', 'Client communication', 'Klantcommunicatie'),
    text: tri(
      'Megkérdezem, mire van valójában szükség, és érthetően elmondom, mi miért történik.',
      'I ask what is really needed and explain clearly what happens and why.',
      'Ik vraag wat er echt nodig is en leg duidelijk uit wat er gebeurt en waarom.',
    ),
  },
  {
    id: 'teamwork',
    name: tri('Csapatmunka', 'Teamwork', 'Samenwerking'),
    text: tri(
      'A jó eredmény közös munka: egyeztetek, visszajelzést kérek és adok.',
      'Good results are shared work: I align, ask for feedback and give it.',
      'Goede resultaten zijn teamwerk: ik stem af, vraag feedback en geef die.',
    ),
  },
  {
    id: 'systems',
    name: tri('Rendszerszemlélet', 'Systems thinking', 'Systeemdenken'),
    text: tri(
      'Egy változtatást a teljes rendszerre gondolva mérlegelek: a felületre, az adatra és az emberekre is.',
      'I weigh a change with the whole system in mind: the interface, the data and the people.',
      'Ik weeg een wijziging af met het hele systeem in gedachten: de interface, de data en de mensen.',
    ),
  },
  {
    id: 'learning',
    name: tri('Folyamatos tanulás', 'Continuous learning', 'Blijven leren'),
    text: tri(
      'Az iparágváltás maga is tanulás volt, és ma is így dolgozom: újat tanulok, kipróbálom, finomítom.',
      'Changing field was learning in itself, and I still work that way: learn something new, try it, refine it.',
      'De overstap naar een ander vakgebied was zelf al leren, en zo werk ik nog steeds: iets nieuws leren, uitproberen, verfijnen.',
    ),
  },
]
