import { tri } from '../../../../content/trilingual'

/** The Sound Reactive World's words. */
export const soundText = {
  tabs: {
    label: tri('Panelek', 'Panels', 'Panelen'),
    sound: tri('Hang', 'Sound', 'Geluid'),
    react: tri('Reakció', 'Reaction', 'Reactie'),
    look: tri('Kinézet', 'Look', 'Uiterlijk'),
  },
  source: {
    label: tri('Hangforrás', 'Sound source', 'Geluidsbron'),
    preview: tri('Néma előnézet', 'Silent preview', 'Stille voorvertoning'),
    builtin: tri('Beépített hang', 'Built-in sound', 'Ingebouwd geluid'),
    mic: tri('Mikrofon', 'Microphone', 'Microfoon'),
    previewNote: tri(
      'Hang nélkül: a beépített dal kottája, úgy kirajzolva, mintha hallanád. Nem valódi hangelemzés.',
      'No sound: the score of the built-in loop, drawn as if you could hear it. It is not an analysis of real sound.',
      'Zonder geluid: de partituur van de ingebouwde loop, getekend alsof je hem hoort. Het is geen analyse van echt geluid.',
    ),
    builtinNote: tri(
      'Egy rövid, négy ütemes dal, amelyet a böngésződ szintetizál menet közben. Nem hangfájl, nem tölt le semmit.',
      'A short four-bar loop your browser synthesises as it goes. It is not an audio file and downloads nothing.',
      'Een korte loop van vier maten die je browser ter plekke synthetiseert. Het is geen audiobestand en downloadt niets.',
    ),
    micNote: tri(
      'A világ a te környezeted hangjára mozdul. Csak akkor kapcsol be, ha megerősíted.',
      'The world moves with the sound around you. It only switches on when you confirm.',
      'De wereld beweegt met het geluid om je heen. Hij gaat pas aan als je bevestigt.',
    ),
  },
  actions: {
    quick: tri('Gyorsgombok', 'Quick actions', 'Snelle acties'),
    runPreview: tri('Előnézet indítása', 'Run the preview', 'Voorvertoning starten'),
    pausePreview: tri('Előnézet szünet', 'Pause the preview', 'Voorvertoning pauzeren'),
    play: tri('Hang indítása', 'Play the sound', 'Geluid afspelen'),
    pause: tri('Hang szünet', 'Pause the sound', 'Geluid pauzeren'),
    useMic: tri('Mikrofon használata', 'Use the microphone', 'Microfoon gebruiken'),
    stopMic: tri('Mikrofon kikapcsolása', 'Switch the microphone off', 'Microfoon uitzetten'),
    allow: tri('Engedélyezem a mikrofont', 'Allow the microphone', 'Microfoon toestaan'),
    notNow: tri('Most nem', 'Not now', 'Nu niet'),
    reset: tri('Alaphelyzet', 'Reset', 'Herstellen'),
  },
  consent: {
    title: tri('Mielőtt a mikrofon bekapcsol', 'Before the microphone switches on', 'Voordat de microfoon aangaat'),
    does: tri(
      'A mikrofon hangját csak a böngésződ elemzi, hogy a kép mozogjon rá.',
      'Your browser only analyses the microphone’s sound, so that the picture can move with it.',
      'Je browser analyseert het geluid van de microfoon alleen, zodat het beeld ermee kan bewegen.',
    ),
    doesNot: tri(
      'Semmit nem rögzít, nem ment és nem küld el sehová, és nem játssza vissza a hangszóróidon.',
      'Nothing is recorded, stored or sent anywhere, and it is never played back on your speakers.',
      'Er wordt niets opgenomen, bewaard of ergens heen gestuurd, en het wordt nooit via je luidsprekers teruggespeeld.',
    ),
    control: tri(
      'Bármikor kikapcsolhatod, és a böngésződ jelzi, amíg be van kapcsolva. Elhagyva az oldalt magától leáll.',
      'You can switch it off at any time, and your browser shows when it is on. Leaving the page switches it off.',
      'Je kunt hem altijd uitzetten, en je browser laat zien wanneer hij aan staat. Als je de pagina verlaat, gaat hij uit.',
    ),
    next: tri(
      'Ha megerősíted, a böngésződ még külön engedélyt kér.',
      'If you confirm, your browser will ask for permission itself.',
      'Als je bevestigt, vraagt je browser zelf nog om toestemming.',
    ),
  },
  status: {
    label: tri('Állapot', 'Status', 'Status'),
    previewRunning: tri(
      'Néma előnézet fut: nincs hang',
      'Silent preview running: no sound',
      'Stille voorvertoning actief: geen geluid',
    ),
    previewPaused: tri(
      'A néma előnézet szünetel',
      'The silent preview is paused',
      'De stille voorvertoning is gepauzeerd',
    ),
    playing: tri('A beépített hang szól', 'The built-in sound is playing', 'Het ingebouwde geluid speelt'),
    paused: tri('A beépített hang szünetel', 'The built-in sound is paused', 'Het ingebouwde geluid is gepauzeerd'),
    asking: tri(
      'Várom a böngésző engedélyét a mikrofonhoz…',
      'Waiting for your browser’s permission for the microphone…',
      'Wachten op de toestemming van je browser voor de microfoon…',
    ),
    micWaiting: tri('A mikrofon még ki van kapcsolva', 'The microphone is still off', 'De microfoon staat nog uit'),
    micOn: tri(
      'A mikrofon be van kapcsolva: nem rögzít, nem küld',
      'The microphone is on: nothing is recorded or sent',
      'De microfoon staat aan: er wordt niets opgenomen of verstuurd',
    ),
  },
  messages: {
    denied: tri(
      'A mikrofonhoz nem kaptam hozzáférést, ezért semmi nem lett rögzítve vagy elemezve. Használhatod a beépített hangot.',
      'The microphone was not made available, so nothing was recorded or analysed. You can use the built-in sound instead.',
      'De microfoon werd niet beschikbaar gesteld, dus er is niets opgenomen of geanalyseerd. Je kunt het ingebouwde geluid gebruiken.',
    ),
    unavailable: tri(
      'Ebben a böngészőben vagy ezen az eszközön nincs elérhető mikrofon. Használhatod a beépített hangot.',
      'There is no microphone available in this browser or on this device. You can use the built-in sound instead.',
      'Er is geen microfoon beschikbaar in deze browser of op dit apparaat. Je kunt het ingebouwde geluid gebruiken.',
    ),
    error: tri(
      'A mikrofont nem sikerült bekapcsolni. Semmi nem fut. Próbáld újra, vagy használd a beépített hangot.',
      'The microphone could not be switched on. Nothing is running. Try again, or use the built-in sound.',
      'De microfoon kon niet worden aangezet. Er draait niets. Probeer opnieuw of gebruik het ingebouwde geluid.',
    ),
    noAudio: tri(
      'Ez a böngésző nem tud hangot lejátszani. A néma előnézet továbbra is működik.',
      'This browser cannot play sound. The silent preview still works.',
      'Deze browser kan geen geluid afspelen. De stille voorvertoning werkt nog steeds.',
    ),
    micStopped: tri(
      'A mikrofon ki van kapcsolva. Semmi nem maradt nyitva.',
      'The microphone is off. Nothing was left open.',
      'De microfoon staat uit. Er is niets open gebleven.',
    ),
  },
  fields: {
    tempo: tri('Tempó (BPM)', 'Tempo (BPM)', 'Tempo (BPM)'),
    volume: tri('Hangerő', 'Volume', 'Volume'),
    sensitivity: tri('Érzékenység', 'Sensitivity', 'Gevoeligheid'),
    smoothing: tri('Simítás', 'Smoothing', 'Gladstrijken'),
    geometry: tri('Basszus → forma', 'Bass → form', 'Bas → vorm'),
    particles: tri('Spektrum → részecskék', 'Spectrum → particles', 'Spectrum → deeltjes'),
    lights: tri('Magasak → fények', 'Highs → lights', 'Hoge tonen → licht'),
    palette: tri('Színpaletta', 'Colour palette', 'Kleurenpalet'),
    density: tri('Részecskesűrűség', 'Particle density', 'Deeltjesdichtheid'),
    waveform: tri('Hullámforma mutatása', 'Show the waveform', 'Golfvorm tonen'),
    meters: tri('Jel', 'Signal', 'Signaal'),
  },
  meters: {
    bass: tri('Basszus', 'Bass', 'Bas'),
    mid: tri('Közép', 'Mids', 'Midden'),
    high: tri('Magas', 'Highs', 'Hoog'),
    level: tri('Hangerő', 'Level', 'Niveau'),
  },
  palettes: {
    racing: tri('Racing', 'Racing', 'Racing'),
    ocean: tri('Óceán', 'Ocean', 'Oceaan'),
    ember: tri('Parázs', 'Ember', 'Gloed'),
    mono: tri('Mono', 'Mono', 'Mono'),
  },
  safety: tri(
    'A fényimpulzusok másodpercenként legfeljebb háromszor ismétlődnek, bármilyen gyors a zene.',
    'The pulses of light never repeat more than three times a second, however fast the music is.',
    'De lichtpulsen herhalen zich nooit vaker dan drie keer per seconde, hoe snel de muziek ook is.',
  ),
  hintActive: tri(
    'Kattints vagy koppints a térre egy fényimpulzusért.',
    'Click or tap the space for a pulse of light.',
    'Klik of tik op de ruimte voor een lichtpuls.',
  ),
  hint: tri(
    'Kattints a térre egy impulzusért. A hang nélküli előnézet vagy a beépített hang indításával mozgásba jön.',
    'Click the space for a pulse. Run the silent preview or play the built-in sound to set it moving.',
    'Klik op de ruimte voor een puls. Start de stille voorvertoning of speel het ingebouwde geluid om hem te laten bewegen.',
  ),
}
