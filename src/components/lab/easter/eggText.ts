import { tri } from '../../../content/trilingual'

/** The words of the hidden racing experience. The name NFSU2 and the address are the destination's own and are not translated. */
export const eggText = {
  dotLabel: tri(
    'Titok: a rejtett versenyélmény megnyitása',
    'Secret: open the hidden racing experience',
    'Geheim: open de verborgen race-ervaring',
  ),
  hint: tri(
    'Psszt. Ezen az oldalon egy piros pont gyorsabb a többinél.',
    'Psst. One red dot on this page is faster than the rest.',
    'Psst. Eén rode stip op deze pagina is sneller dan de rest.',
  ),
  intro: tri('Belépés a boxutcába', 'Entering the pit lane', 'De pitstraat in'),
  dialogLabel: tri('Rejtett versenyélmény: NFSU2', 'Hidden racing experience: NFSU2', 'Verborgen race-ervaring: NFSU2'),
  // While the red transition plays (the loading state).
  leaving: tri(
    'Az nfsu2.xyz egy külső weboldal. Escape: vissza a Labba.',
    'nfsu2.xyz is an external website. Escape: back to the Lab.',
    'nfsu2.xyz is een externe website. Escape: terug naar het Lab.',
  ),
  // After it: the site cannot be shown inside this page (it forbids framing), so it opens on its own.
  readyTitle: tri('Az NFSU2 a saját oldalán fut', 'NFSU2 runs on its own website', 'NFSU2 draait op een eigen website'),
  readyNote: tri(
    'Ezen az oldalon belül nem jeleníthető meg: az oldal nem engedi, és ez a weboldal nem is próbálja megkerülni. Új lapon nyílik meg (nfsu2.xyz).',
    'It cannot be shown inside this page: the site does not allow it, and this website does not try to get around that. It opens in a new tab (nfsu2.xyz).',
    'Hij kan niet binnen deze pagina worden getoond: de site staat dat niet toe en deze website probeert dat niet te omzeilen. Hij opent in een nieuw tabblad (nfsu2.xyz).',
  ),
  open: tri('NFSU2 megnyitása', 'OPEN NFSU2', 'NFSU2 openen'),
  newTab: tri('(új lapon nyílik meg)', '(opens in a new tab)', '(opent in een nieuw tabblad)'),
  back: tri('Vissza a Labba', 'Back to the Lab', 'Terug naar het Lab'),
}
