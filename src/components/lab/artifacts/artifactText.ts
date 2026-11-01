import { tri } from '../../../content/trilingual'

/** The words of the saved-works panel and of the save messages the experiments show. */
export const artifactText = {
  title: tri('Mentett alkotásaid', 'Your saved works', 'Je bewaarde werken'),
  intro: tri(
    'Amit a kísérletekben alkotsz és elmentesz, itt gyűlik: tipográfiai kompozíciók és anyagbeállítások. Regisztráció nélkül, csak ebben a böngészőben. Bármelyiket letöltheted fájlként.',
    'Whatever you make and keep in the experiments gathers here: typographic compositions and material presets. No account, in this browser only. You can download any of it as a file.',
    'Wat je in de experimenten maakt en bewaart, verzamelt zich hier: typografische composities en materiaalinstellingen. Zonder account, alleen in deze browser. Je kunt alles als bestand downloaden.',
  ),
  types: {
    typography: tri('Tipográfiai alkotás', 'Typography artwork', 'Typografisch werk'),
    material: tri('Anyagbeállítás', 'Material preset', 'Materiaalinstelling'),
  },
  empty: tri(
    'Még nincs mentett alkotás. A Type in Motionben és a Liquid Matterben a „Mentés” gombbal tehetsz ide egyet.',
    'Nothing kept yet. In Type in Motion and Liquid Matter, use “Save” to put one here.',
    'Nog niets bewaard. Gebruik in Type in Motion en Liquid Matter “Opslaan” om er een neer te zetten.',
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
  saved: tri('Elmentve a böngészőbe.', 'Saved in this browser.', 'Opgeslagen in deze browser.'),
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
  save: tri('Mentés a böngészőbe', 'Save in this browser', 'Opslaan in deze browser'),
  keep: {
    title: tri('Megőrzés', 'Keep', 'Bewaren'),
    png: tri('Kép mentése (PNG)', 'Save image (PNG)', 'Beeld opslaan (PNG)'),
    imageReady: tri(
      'A kép elkészült és letöltődött.',
      'The image is ready and downloaded.',
      'Het beeld is klaar en gedownload.',
    ),
    imageFailed: tri(
      'A képet nem sikerült elkészíteni.',
      'The image could not be made.',
      'Het beeld kon niet worden gemaakt.',
    ),
    noPicture: tri(
      'Álló nézetben nincs mit lefényképezni: a beállításokat így is elmentem, kép nélkül.',
      'The still view has nothing to photograph: the settings are kept anyway, without a picture.',
      'De statische weergave heeft niets om te fotograferen: de instellingen worden toch bewaard, zonder beeld.',
    ),
    typography: tri(
      'A mondat és a beállítások egy tipográfiai alkotásként mentődnek, a képpel együtt.',
      'The sentence and its settings are kept as a typography artwork, with the picture.',
      'De zin en zijn instellingen worden bewaard als typografisch werk, met het beeld.',
    ),
    material: tri(
      'Az anyagállapot és a beállításai anyagbeállításként mentődnek, a képpel együtt.',
      'The state of matter and its settings are kept as a material preset, with the picture.',
      'De toestand en zijn instellingen worden bewaard als materiaalinstelling, met het beeld.',
    ),
  },
}
