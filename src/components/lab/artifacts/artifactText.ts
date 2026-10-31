import { tri } from '../../../content/trilingual'

/** The words of the Digital Artifacts panel, of the save messages the experiences show and of the achievements. */
export const artifactText = {
  title: tri('Digitális alkotások', 'Digital artifacts', 'Digitale creaties'),
  intro: tri(
    'Minden, amit a kísérletekben alkotsz és elmentesz, itt gyűlik: modellek, pályák, autóbeállítások. Regisztráció nélkül, csak ebben a böngészőben. Bármelyiket letöltheted fájlként.',
    'Everything you make and keep in the experiments gathers here: models, tracks, car setups. No account, in this browser only. You can download any of it as a file.',
    'Alles wat je in de experimenten maakt en bewaart, verzamelt zich hier: modellen, banen, auto-instellingen. Zonder account, alleen in deze browser. Je kunt alles als bestand downloaden.',
  ),
  types: {
    model: tri('3D modell', '3D model', '3D-model'),
    track: tri('Pálya', 'Track design', 'Baanontwerp'),
    setup: tri('Autóbeállítás', 'Vehicle setup', 'Auto-instelling'),
  },
  empty: tri(
    'Még nincs mentett alkotás. A Model Studióban, a Track Architectben és a Performance Labban a „Mentés az alkotások közé” gombbal tehetsz ide egyet.',
    'Nothing kept yet. In Model Studio, Track Architect and Performance Lab, use “Save to Digital Artifacts” to put one here.',
    'Nog niets bewaard. Gebruik in Model Studio, Track Architect en Performance Lab “Opslaan bij Digitale creaties” om er een neer te zetten.',
  ),
  loading: tri('Betöltés…', 'Loading…', 'Laden…'),
  open: tri('Megnyitás: {name}', 'Open {name}', 'Open {name}'),
  openShort: tri('Megnyitás', 'Open', 'Openen'),
  rename: tri('Átnevezés: {name}', 'Rename {name}', 'Hernoem {name}'),
  renameLabel: tri('Új név', 'New name', 'Nieuwe naam'),
  confirmRename: tri('Név mentése', 'Save name', 'Naam opslaan'),
  json: tri('JSON letöltése: {name}', 'Download JSON of {name}', 'Download JSON van {name}'),
  png: tri('PNG letöltése: {name}', 'Download PNG of {name}', 'Download PNG van {name}'),
  remove: tri('Törlés: {name}', 'Delete {name}', 'Verwijder {name}'),
  confirmRemove: tri('Biztosan törlöd: {name}?', 'Really delete {name}?', '{name} echt verwijderen?'),
  yes: tri('Igen, törlöm', 'Yes, delete', 'Ja, verwijder'),
  no: tri('Mégsem', 'Cancel', 'Annuleren'),
  saved: tri('Mentve a Digitális alkotások közé.', 'Saved to Digital Artifacts.', 'Opgeslagen bij Digitale creaties.'),
  savedSession: tri(
    'Mentve, de ez a böngésző nem engedi a tartós tárolást: az alkotás csak az újratöltésig marad meg. Töltsd le fájlként.',
    'Saved, but this browser will not keep it: it stays only until the page is reloaded. Download it as a file.',
    'Opgeslagen, maar deze browser bewaart het niet: het blijft alleen tot de pagina herlaadt. Download het als bestand.',
  ),
  failed: {
    'too-large': tri(
      'Az alkotás túl nagy a mentéshez.',
      'The work is too large to keep.',
      'Het werk is te groot om te bewaren.',
    ),
    full: tri(
      'Elértad a 100 alkotás határát: törölj egyet.',
      'You have reached the limit of 100 works: delete one.',
      'Je hebt de limiet van 100 werken bereikt: verwijder er een.',
    ),
    quota: tri(
      'A böngésző tárhelye betelt: törölj egy alkotást, vagy szabadíts fel helyet.',
      'The browser’s storage is full: delete a work or free some space.',
      'De opslag van de browser is vol: verwijder een werk of maak ruimte vrij.',
    ),
    blocked: tri(
      'A mentés nem sikerült: a böngésző megtagadta a tárolást.',
      'Saving failed: the browser refused to store it.',
      'Opslaan mislukt: de browser weigerde het te bewaren.',
    ),
    invalid: tri(
      'Az alkotás adata nem érvényes, ezért nem mentettem.',
      'The work’s data is not valid, so it was not saved.',
      'De gegevens van het werk zijn ongeldig, dus het is niet opgeslagen.',
    ),
  },
  openFailed: tri(
    'Ezt az alkotást nem lehet megnyitni: az adata sérült.',
    'This work cannot be opened: its data is damaged.',
    'Dit werk kan niet worden geopend: de gegevens zijn beschadigd.',
  ),
  renamed: tri('Átnevezve.', 'Renamed.', 'Hernoemd.'),
  deleted: tri('Törölve.', 'Deleted.', 'Verwijderd.'),
  storage: tri(
    'Tárhely: {used} / {quota} MB a böngészőben',
    'Storage: {used} of {quota} MB in this browser',
    'Opslag: {used} van {quota} MB in deze browser',
  ),
  persistent: tri('Tartósan tárolva (IndexedDB).', 'Kept for good (IndexedDB).', 'Blijvend bewaard (IndexedDB).'),
  notPersistent: tri(
    'Ez a böngésző nem engedi a tartós tárolást: az alkotások csak ebben a látogatásban maradnak meg.',
    'This browser will not keep data: works last only for this visit.',
    'Deze browser bewaart geen gegevens: werken blijven alleen tijdens dit bezoek.',
  ),
  save: tri('Mentés az alkotások közé', 'Save to Digital Artifacts', 'Opslaan bij Digitale creaties'),
  progress: {
    title: tri('Haladás', 'Progress', 'Voortgang'),
    level: tri('{level}. szint', 'Level {level}', 'Niveau {level}'),
    xp: tri(
      '{xp} XP · még {left} a következő szintig',
      '{xp} XP · {left} to the next level',
      '{xp} XP · nog {left} tot het volgende niveau',
    ),
    note: tri(
      'Pont csak ténylegesen megtörtént dologért jár, egyszer. Nincs sorozat és nincs kényszer a visszatérésre.',
      'Points are given only for things that really happened, once each. There are no streaks and no pressure to come back.',
      'Punten krijg je alleen voor dingen die echt gebeurden, één keer. Geen reeksen en geen druk om terug te komen.',
    ),
    unlocked: tri('megszerezve', 'unlocked', 'behaald'),
    locked: tri('még nincs meg', 'not yet', 'nog niet'),
    reset: tri('Haladás törlése', 'Reset progress', 'Voortgang wissen'),
    confirmReset: tri(
      'Biztosan törlöd az XP-t és az achievementeket?',
      'Really clear your XP and achievements?',
      'XP en prestaties echt wissen?',
    ),
  },
  achievements: {
    'first-model': {
      name: tri('First Model', 'First Model', 'Eerste model'),
      how: tri('Ments el egy 3D modellt.', 'Save a 3D model.', 'Sla een 3D-model op.'),
    },
    'first-lap': {
      name: tri('First Lap', 'First Lap', 'Eerste ronde'),
      how: tri(
        'Teljesíts egy kört a Racing Experience-ben, mindkét szektorkapun át.',
        'Complete a lap in the Racing Experience, through both sector gates.',
        'Voltooi een ronde in de Racing Experience, door beide sectorpoorten.',
      ),
    },
    'first-drift': {
      name: tri('First Drift', 'First Drift', 'Eerste drift'),
      how: tri(
        'Tarts meg egy driftet, és vidd be a Drift Challenge-ben (kézifék, majd ellenkormányzás).',
        'Hold a slide and bank it in the Drift Challenge (a handbrake kick, then counter-steer).',
        'Houd een slip vast en bank hem in de Drift Challenge (handremtik, dan tegensturen).',
      ),
    },
    'perfect-lap': {
      name: tri('Perfect Lap', 'Perfect Lap', 'Perfecte ronde'),
      how: tri(
        'Tiszta kör ütközés és pályaelhagyás nélkül.',
        'A clean lap with no contact and no leaving the track.',
        'Een schone ronde zonder contact en zonder de baan te verlaten.',
      ),
    },
    'track-designer': {
      name: tri('Track Designer', 'Track Designer', 'Baanontwerper'),
      how: tri(
        'Tervezz pályát, amely átmegy az ellenőrzésen, és vezesd a Racingben.',
        'Design a track that passes validation and drive it in Racing.',
        'Ontwerp een baan die de controle doorstaat en rijd hem in Racing.',
      ),
    },
    'engineer-mind': {
      name: tri('Engineer Mind', 'Engineer Mind', 'Ingenieursgeest'),
      how: tri(
        'Hasonlíts össze két különböző autóbeállítást a Performance Labban.',
        'Compare two different car setups in Performance Lab.',
        'Vergelijk twee verschillende auto-instellingen in Performance Lab.',
      ),
    },
    'first-creation': {
      name: tri('First Creation', 'First Creation', 'Eerste creatie'),
      how: tri(
        'Ments el egy alkotást a Digitális alkotások közé.',
        'Keep a work in Digital Artifacts.',
        'Bewaar een werk bij Digitale creaties.',
      ),
    },
  },
}
