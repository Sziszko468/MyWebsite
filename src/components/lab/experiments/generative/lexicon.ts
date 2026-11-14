import type {
  AccessoryId,
  BackgroundId,
  Build,
  CameraAngle,
  ConceptId,
  LightId,
  MaterialId,
  Mood,
  Pose,
  PropId,
  Size,
  StyleId,
} from './spec'

/**
 * The vocabulary the page reads a description with, in Hungarian, English and Dutch side by side.
 * Every entry says which words mean it (as stems, with no accents: Hungarian and Dutch words are
 * matched by their beginning, so "banánnal" and "bananen" are found) and how it is named when the
 * page speaks (a title, a chip, a random idea). It is a closed list: a word that is not here is not
 * understood, and the page says so instead of pretending.
 */
export type Lang = 'hu' | 'en' | 'nl'
export const LANGS: readonly Lang[] = ['hu', 'en', 'nl']

/** Stems per language. A stem starting with `=` must match the whole word. */
export interface Words {
  hu: readonly string[]
  en: readonly string[]
  nl: readonly string[]
}

const words = (hu: string, en: string, nl: string): Words => ({
  hu: hu ? hu.split('|') : [],
  en: en ? en.split('|') : [],
  nl: nl ? nl.split('|') : [],
})

export type Names = Record<Lang, string>
const names = (hu: string, en: string, nl: string): Names => ({ hu, en, nl })

export interface Term {
  words: Words
  names: Names
}

export interface ConceptTerm extends Term {
  /** The Hungarian accusative, for the sentences that put it after a verb ("versenyautót vezet"). */
  huAcc: string
  /** Dutch "het" words take no -e on a describing word after "een". */
  nlHet?: boolean
}

export interface AdjectiveTerm extends Term {
  /** The Dutch form before a "de" word. */
  nlE: string
}

/** Removes accents and case, so "Hűtőszekrény" and "hutoszekreny" are the same word. */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
}

export const CONCEPT_TERMS: Record<ConceptId, ConceptTerm> = {
  banana: {
    words: words('banan', 'banana', 'banaan|bananen'),
    names: names('banán', 'banana', 'banaan'),
    huAcc: 'banánt',
  },
  croissant: {
    words: words('croissant|kifli|kifl', 'croissant', 'croissant'),
    names: names('croissant', 'croissant', 'croissant'),
    huAcc: 'croissant-t',
    nlHet: true,
  },
  pizza: { words: words('pizza', 'pizza', 'pizza'), names: names('pizza', 'pizza', 'pizza'), huAcc: 'pizzát' },
  donut: {
    words: words('fank|donut', 'donut|doughnut', 'donut'),
    names: names('fánk', 'donut', 'donut'),
    huAcc: 'fánkot',
  },
  burger: {
    words: words('hamburger|burger', 'hamburger|burger|cheeseburger', 'hamburger|burger'),
    names: names('hamburger', 'burger', 'hamburger'),
    huAcc: 'hamburgert',
  },
  egg: { words: words('tojas', '=egg', '=ei|eieren'), names: names('tojás', 'egg', 'ei'), huAcc: 'tojást', nlHet: true },
  avocado: {
    words: words('avokado', 'avocado', 'avocado'),
    names: names('avokádó', 'avocado', 'avocado'),
    huAcc: 'avokádót',
  },
  cheese: {
    words: words('sajt', 'cheese', 'kaas'),
    names: names('sajt', 'cheese', 'kaas'),
    huAcc: 'sajtot',
  },
  frog: {
    words: words('beka', 'frog', 'kikker'),
    names: names('béka', 'frog', 'kikker'),
    huAcc: 'békát',
  },
  dinosaur: {
    words: words('dinoszaurusz|dino', 'dinosaur|dino|t-rex|trex', 'dinosaurus|dino'),
    names: names('dinoszaurusz', 'dinosaur', 'dinosaurus'),
    huAcc: 'dinoszauruszt',
  },
  cat: {
    words: words('macska|cica', '=cat|kitten|kitty', '=kat|katten|poes'),
    names: names('macska', 'cat', 'kat'),
    huAcc: 'macskát',
  },
  duck: {
    words: words('kacsa', 'duck|ducky', 'eend|eendje'),
    names: names('kacsa', 'duck', 'eend'),
    huAcc: 'kacsát',
  },
  penguin: {
    words: words('pingvin', 'penguin', 'pinguin'),
    names: names('pingvin', 'penguin', 'pinguïn'),
    huAcc: 'pingvint',
  },
  shark: {
    words: words('capa', 'shark', 'haai'),
    names: names('cápa', 'shark', 'haai'),
    huAcc: 'cápát',
  },
  cactus: {
    words: words('kaktusz', 'cactus|cacti', 'cactus|cactussen'),
    names: names('kaktusz', 'cactus', 'cactus'),
    huAcc: 'kaktuszt',
  },
  robot: { words: words('robot', 'robot', 'robot'), names: names('robot', 'robot', 'robot'), huAcc: 'robotot' },
  fridge: {
    words: words('hutoszekreny|huto|hutogep', 'fridge|refrigerator|freezer', 'koelkast|ijskast|vriezer'),
    names: names('hűtőszekrény', 'refrigerator', 'koelkast'),
    huAcc: 'hűtőszekrényt',
  },
  coffeemachine: {
    words: words(
      'kavefozo|kavegep|kavefozogep',
      'coffee machine|coffee maker|espresso machine',
      'koffiemachine|koffiezetapparaat|espressomachine',
    ),
    names: names('kávéfőző', 'coffee machine', 'koffiemachine'),
    huAcc: 'kávéfőzőt',
  },
  toaster: {
    words: words('kenyerpirito|piritogep', 'toaster', 'broodrooster'),
    names: names('kenyérpirító', 'toaster', 'broodrooster'),
    huAcc: 'kenyérpirítót',
  },
  washer: {
    words: words('mosogep', 'washing machine|washer', 'wasmachine'),
    names: names('mosógép', 'washing machine', 'wasmachine'),
    huAcc: 'mosógépet',
  },
  tv: {
    words: words('televizio|=tv|=tevé', '=tv|television|telly', '=tv|televisie'),
    names: names('televízió', 'television', 'televisie'),
    huAcc: 'televíziót',
  },
  teapot: {
    words: words('teaskanna|teafozo|kanna', 'teapot|kettle', 'theepot|waterkoker'),
    names: names('teáskanna', 'teapot', 'theepot'),
    huAcc: 'teáskannát',
  },
  sneaker: {
    words: words('tornacipo|sportcipo|cipo', 'sneaker|sneakers|trainer|trainers|shoe', 'sneaker|sportschoen|gympen|schoen'),
    names: names('tornacipő', 'sneaker', 'sneaker'),
    huAcc: 'tornacipőt',
  },
  alien: {
    words: words('idegen|urlen|marsi', 'alien|martian', 'alien|marsmannetje|ruimtewezen'),
    names: names('űrlény', 'alien', 'alien'),
    huAcc: 'űrlényt',
  },
  ghost: {
    words: words('szellem|kisertet', 'ghost|spook', 'spook|geest'),
    names: names('szellem', 'ghost', 'spook'),
    huAcc: 'szellemet',
  },
  snowman: {
    words: words('hoember', 'snowman', 'sneeuwman'),
    names: names('hóember', 'snowman', 'sneeuwman'),
    huAcc: 'hóembert',
  },
  pumpkin: {
    words: words('sutotok|=tok|tokfej', 'pumpkin', 'pompoen'),
    names: names('sütőtök', 'pumpkin', 'pompoen'),
    huAcc: 'sütőtököt',
  },
  person: {
    words: words('ember|ferfi|szemely', 'man|woman|person|human|guy|lady', 'mens|man|vrouw|persoon'),
    names: names('ember', 'person', 'mens'),
    huAcc: 'embert',
  },
  sportscar: {
    words: words(
      'sportauto|sportkocsi|auto|kocsi|jarmu|auto',
      'sports car|sportscar|supercar|car|automobile|vehicle',
      'sportwagen|sportauto|auto|wagen',
    ),
    names: names('sportautó', 'sports car', 'sportwagen'),
    huAcc: 'sportautót',
  },
  racecar: {
    words: words(
      'versenyauto|versenykocsi|formula',
      'racing car|race car|racecar|racer|formula one|f1|go-kart|kart',
      'racewagen|raceauto|formule',
    ),
    names: names('versenyautó', 'racing car', 'racewagen'),
    huAcc: 'versenyautót',
  },
  spaceship: {
    words: words(
      'urhajo|urjarmu|csillaghajo',
      'spaceship|space ship|starship|spacecraft|space shuttle|shuttle',
      'ruimteschip|ruimteraket|ruimtevaartuig',
    ),
    names: names('űrhajó', 'spaceship', 'ruimteschip'),
    huAcc: 'űrhajót',
    nlHet: true,
  },
  rocket: {
    words: words('raketa', 'rocket|missile', 'raket'),
    names: names('rakéta', 'rocket', 'raket'),
    huAcc: 'rakétát',
  },
  ufo: {
    words: words('=ufo|repulo csesze|repulo tanyer', '=ufo|flying saucer', '=ufo|vliegende schotel'),
    names: names('UFO', 'UFO', 'ufo'),
    huAcc: 'UFO-t',
  },
  bicycle: {
    words: words('bicikli|kerekpar|=bringa', 'bicycle|bike|bmx', 'fiets|racefiets'),
    names: names('bicikli', 'bicycle', 'fiets'),
    huAcc: 'biciklit',
  },
}

export interface AccessoryTerm extends Term {
  plural?: boolean
}

export const ACCESSORY_TERMS: Record<AccessoryId, AccessoryTerm> = {
  sunglasses: {
    words: words('napszemuveg', 'sunglasses|shades', 'zonnebril'),
    names: names('napszemüveg', 'sunglasses', 'zonnebril'),
    plural: true,
  },
  glasses: {
    words: words('szemuveg', 'glasses|spectacles', 'bril'),
    names: names('szemüveg', 'glasses', 'bril'),
    plural: true,
  },
  tophat: {
    words: words('cilinder|kalap', 'top hat|hat', 'hoge hoed|hoed'),
    names: names('cilinder', 'top hat', 'hoge hoed'),
  },
  crown: { words: words('korona', 'crown|tiara', 'kroon'), names: names('korona', 'crown', 'kroon') },
  helmet: {
    words: words('urhajossisak|sisak|buraszisak', 'helmet|space helmet', 'helm|ruimtehelm'),
    names: names('sisak', 'space helmet', 'ruimtehelm'),
  },
  cap: {
    words: words('sapka|baseballsapka', '=cap|baseball cap', 'pet|baseballpet'),
    names: names('baseballsapka', 'cap', 'pet'),
  },
  partyhat: {
    words: words('partisapka|parti sapka|szulinapisapka|szulinapi sapka|party sapka', 'party hat|birthday hat', 'feesthoed|feestmuts'),
    names: names('partisapka', 'party hat', 'feesthoedje'),
  },
  chefhat: {
    words: words('szakacssapka', 'chef hat|chefs hat|toque', 'koksmuts'),
    names: names('szakácssapka', 'chef hat', 'koksmuts'),
  },
  wizardhat: {
    words: words('varazslokalap|varazslo sapka', 'wizard hat|witch hat', 'tovenaarshoed|heksenhoed'),
    names: names('varázslókalap', 'wizard hat', 'tovenaarshoed'),
  },
  tie: { words: words('nyakkendo', '=tie|necktie', 'stropdas'), names: names('nyakkendő', 'tie', 'stropdas') },
  bowtie: {
    words: words('csokornyakkendo|csokor', 'bow tie|bowtie', 'vlinderdas'),
    names: names('csokornyakkendő', 'bow tie', 'vlinderdas'),
  },
  gloves: {
    words: words('bokszkesztyu|kesztyu', 'boxing gloves|boxing glove|gloves|glove', 'bokshandschoenen|bokshandschoen|handschoenen|handschoen'),
    names: names('bokszkesztyű', 'boxing gloves', 'bokshandschoenen'),
    plural: true,
  },
  cape: { words: words('kopeny|palast', '=cape|cloak', 'cape|mantel'), names: names('köpeny', 'cape', 'cape') },
  scarf: {
    words: words('=sal|nyaksal|sal', 'scarf', 'sjaal'),
    names: names('sál', 'scarf', 'sjaal'),
  },
  headphones: {
    words: words('fejhallgato', 'headphones|headset', 'koptelefoon|hoofdtelefoon'),
    names: names('fejhallgató', 'headphones', 'koptelefoon'),
    plural: true,
  },
  backpack: { words: words('hatizsak', 'backpack|rucksack', 'rugzak'), names: names('hátizsák', 'backpack', 'rugzak') },
  wings: {
    words: words('szarny', 'wings|wing', 'vleugels|vleugel'),
    names: names('szárny', 'wings', 'vleugels'),
    plural: true,
  },
  mustache: {
    words: words('bajusz', 'mustache|moustache', 'snor'),
    names: names('bajusz', 'mustache', 'snor'),
  },
  chain: {
    words: words('aranylanc|lanc', 'gold chain|chain|bling', 'gouden ketting|ketting'),
    names: names('aranylánc', 'gold chain', 'gouden ketting'),
  },
  medal: { words: words('erem', 'medal', 'medaille'), names: names('érem', 'medal', 'medaille') },
  jetpack: {
    words: words('sugarhajtomu|sugarhatu|jetpack', 'jetpack|jet pack', 'jetpack'),
    names: names('jetpack', 'jetpack', 'jetpack'),
  },
}

export interface PropTerm extends Term {
  plural?: boolean
}

export const PROP_TERMS: Record<PropId, PropTerm> = {
  coffee: { words: words('kave', 'coffee', 'koffie'), names: names('kávé', 'coffee', 'koffie') },
  globe: {
    words: words('vilag|foldgomb|bolygo', 'world|globe|earth|planet', 'wereld|aarde|planeet'),
    names: names('világ', 'world', 'wereld'),
  },
  trophy: { words: words('trofea|serleg|kupa', 'trophy', 'trofee|beker'), names: names('trófea', 'trophy', 'trofee') },
  money: {
    words: words('penz|dollar|bankjegy', 'money|cash|dollar|dollars', 'geld|dollar'),
    names: names('pénz', 'money', 'geld'),
  },
  flag: { words: words('zaszlo', 'flag', 'vlag'), names: names('zászló', 'flag', 'vlag') },
  balloon: { words: words('lufi|leggomb', 'balloon|balloons', 'ballon|ballonnen'), names: names('lufi', 'balloon', 'ballon') },
  laptop: { words: words('laptop|szamitogep', 'laptop|computer', 'laptop|computer'), names: names('laptop', 'laptop', 'laptop') },
  briefcase: {
    words: words('aktataska|diplomatataska', 'briefcase|suitcase|attache', 'aktetas|koffer'),
    names: names('aktatáska', 'briefcase', 'aktetas'),
  },
  guitar: { words: words('gitar', 'guitar', 'gitaar'), names: names('gitár', 'guitar', 'gitaar') },
  flower: { words: words('virag', 'flower|rose', 'bloem|roos'), names: names('virág', 'flower', 'bloem') },
  cake: { words: words('torta|sutemeny', 'cake', 'taart|cake'), names: names('torta', 'cake', 'taart') },
}

/** A job: it brings its own clothes, tools and way of standing. */
export interface RoleTerm extends Term {
  /** "working as a manager": the form after "as". */
  as: Names
  accessories: readonly AccessoryId[]
  props: readonly PropId[]
  pose: Pose
  mood?: Mood
}

export type RoleId = 'manager' | 'astronaut' | 'king' | 'wizard' | 'chef' | 'boxer' | 'dj' | 'superhero' | 'rockstar'

export const ROLE_TERMS: Record<RoleId, RoleTerm> = {
  manager: {
    words: words('menedzser|cegvezeto|vezerigazgato|fonok|vezeto', 'manager|boss|executive|ceo', 'manager|baas|directeur|bedrijfsleider'),
    names: names('menedzser', 'manager', 'manager'),
    as: names('cégvezetőként', 'a corporate manager', 'manager'),
    accessories: ['tie', 'glasses'],
    props: ['briefcase'],
    pose: 'work',
  },
  astronaut: {
    words: words('asztronauta|urhajos', 'astronaut|cosmonaut', 'astronaut|ruimtevaarder'),
    names: names('űrhajós', 'astronaut', 'astronaut'),
    as: names('űrhajósként', 'an astronaut', 'astronaut'),
    accessories: ['helmet', 'backpack'],
    props: ['flag'],
    pose: 'stand',
  },
  king: {
    words: words('kiraly|kiralyno|uralkodo', 'king|queen|emperor', 'koning|koningin|keizer'),
    names: names('király', 'king', 'koning'),
    as: names('királyként', 'a king', 'koning'),
    accessories: ['crown', 'cape', 'chain'],
    props: [],
    pose: 'stand',
    mood: 'proud',
  },
  wizard: {
    words: words('varazslo|boszorkany', 'wizard|witch|sorcerer', 'tovenaar|heks'),
    names: names('varázsló', 'wizard', 'tovenaar'),
    as: names('varázslóként', 'a wizard', 'tovenaar'),
    accessories: ['wizardhat', 'cape'],
    props: [],
    pose: 'stand',
  },
  chef: {
    words: words('szakacs|fozo', '=chef|cook', 'kok|chef'),
    names: names('szakács', 'chef', 'kok'),
    as: names('szakácsként', 'a chef', 'kok'),
    accessories: ['chefhat', 'mustache'],
    props: ['cake'],
    pose: 'stand',
  },
  boxer: {
    words: words('bokszolo', 'boxer|fighter', 'bokser|vechter'),
    names: names('bokszoló', 'boxer', 'bokser'),
    as: names('bokszolóként', 'a boxer', 'bokser'),
    accessories: ['gloves'],
    props: [],
    pose: 'box',
    mood: 'angry',
  },
  dj: {
    words: words('=dj|lemezlovas', '=dj|disc jockey', '=dj'),
    names: names('DJ', 'DJ', 'dj'),
    as: names('DJ-ként', 'a DJ', 'dj'),
    accessories: ['headphones', 'sunglasses'],
    props: [],
    pose: 'dance',
    mood: 'cool',
  },
  superhero: {
    words: words('szuperhos|=hos', 'superhero|hero', 'superheld|held'),
    names: names('szuperhős', 'superhero', 'superheld'),
    as: names('szuperhősként', 'a superhero', 'superheld'),
    accessories: ['cape'],
    props: [],
    pose: 'fly',
    mood: 'proud',
  },
  rockstar: {
    words: words('rocksztar|zenesz', 'rockstar|rock star|musician', 'rockster|muzikant'),
    names: names('rocksztár', 'rock star', 'rockster'),
    as: names('rocksztárként', 'a rock star', 'rockster'),
    accessories: ['sunglasses', 'chain'],
    props: ['guitar'],
    pose: 'dance',
    mood: 'cool',
  },
}

export const MOOD_TERMS: Record<Mood, AdjectiveTerm> = {
  happy: {
    words: words('boldog|vidam|derus|jokedvu', 'happy|cheerful|joyful|smiling', 'blij|vrolijk|gelukkig'),
    names: names('boldog', 'happy', 'blij'),
    nlE: 'blije',
  },
  sad: {
    words: words('szomoru|=bus|lehangolt', 'sad|unhappy|depressed|gloomy|crying', 'droevig|verdrietig|bedroefd|treurig'),
    names: names('szomorú', 'sad', 'droevig'),
    nlE: 'droevige',
  },
  angry: {
    words: words('duhos|haragos|mergesen|dorzsolo', 'angry|mad|furious|grumpy|evil', 'boos|woedend|kwaad|nijdig'),
    names: names('dühös', 'angry', 'boos'),
    nlE: 'boze',
  },
  surprised: {
    words: words('meglepett|megdobbent|dobbenetes', 'surprised|shocked|amazed|astonished', 'verrast|verbaasd|geschokt'),
    names: names('meglepett', 'surprised', 'verrast'),
    nlE: 'verraste',
  },
  sleepy: {
    words: words('almos|faradt|alvo', 'sleepy|tired|drowsy|lazy', 'slaperig|moe|loom'),
    names: names('álmos', 'sleepy', 'slaperig'),
    nlE: 'slaperige',
  },
  cool: {
    words: words('meno|laza|menő', 'cool|chill|swag', 'stoer|cool'),
    names: names('menő', 'cool', 'stoer'),
    nlE: 'stoere',
  },
  scared: {
    words: words('ijedt|felt|rettegő|retteg', 'scared|afraid|frightened|terrified|nervous', 'bang|angstig|doodsbang'),
    names: names('ijedt', 'scared', 'bang'),
    nlE: 'bange',
  },
  proud: {
    words: words('buszke|bizakodo|gyozedelmes', 'proud|triumphant|victorious', 'trots|zegevierend'),
    names: names('büszke', 'proud', 'trots'),
    nlE: 'trotse',
  },
}

export const BUILD_TERMS: Record<Build, AdjectiveTerm | null> = {
  thin: {
    words: words('vekony|sovany|csontsovany', 'thin|skinny|slim|slender', 'dun|mager|slank'),
    names: names('vékony', 'skinny', 'dun'),
    nlE: 'dunne',
  },
  normal: null,
  muscular: {
    words: words('izmos|eros|izomtomeg|testepitő', 'muscular|strong|buff|ripped|jacked|beefy', 'gespierd|sterk|gespierde'),
    names: names('izmos', 'muscular', 'gespierd'),
    nlE: 'gespierde',
  },
  round: {
    words: words('kover|dagadt|pufi|gombolyu', 'fat|chubby|round|plump|fluffy', 'dik|mollig|rond|bolletje'),
    names: names('kövér', 'chubby', 'mollig'),
    nlE: 'mollige',
  },
}

export const SIZE_TERMS: Record<Size, AdjectiveTerm | null> = {
  tiny: {
    words: words('apro|kicsi|pici|miniatur|mini', 'tiny|small|little|mini|miniature|baby', 'piepklein|klein|mini|miniatuur'),
    names: names('apró', 'tiny', 'piepklein'),
    nlE: 'piepkleine',
  },
  normal: null,
  giant: {
    words: words('orias|hatalmas|gigantikus|monumentalis|nagy', 'giant|huge|enormous|gigantic|massive|colossal', 'reusachtig|enorm|gigantisch|gigantische|reuzen'),
    names: names('óriás', 'giant', 'reusachtig'),
    nlE: 'reusachtige',
  },
}

export const MATERIAL_TERMS: Record<MaterialId, AdjectiveTerm | null> = {
  natural: null,
  gold: {
    words: words('arany|aranyozott', 'golden|gold|gilded', 'gouden|goud|verguld'),
    names: names('arany', 'golden', 'gouden'),
    nlE: 'gouden',
  },
  chrome: {
    words: words('krom|kromozott|fem|ezust', 'chrome|chromed|metal|metallic|silver|steel', 'chroom|chromen|metalen|zilveren|stalen'),
    names: names('króm', 'chrome', 'chromen'),
    nlE: 'chromen',
  },
  glass: {
    words: words('uveg|kristaly|atlatszo', 'glass|crystal|transparent|glassy', 'glas|glazen|kristallen|transparant'),
    names: names('üveg', 'glass', 'glazen'),
    nlE: 'glazen',
  },
  matte: {
    words: words('matt', 'matte|plain', 'mat'),
    names: names('matt', 'matte', 'matte'),
    nlE: 'matte',
  },
  neon: {
    words: words('neon|fenylo|izzo|vilagito', '=neon|glowing|luminous', 'neon|gloeiend|lichtgevend'),
    names: names('neon', 'neon', 'neon'),
    nlE: 'neon',
  },
  candy: {
    words: words('cukorka|cukros|gumicukor', 'candy|sugary|jelly|plastic', 'snoep|suikerzoet|plastic|plastieken'),
    names: names('cukorka', 'candy', 'snoep'),
    nlE: 'snoep',
  },
  wood: {
    words: words('fa|fabol|faragott|fas', '=wooden|=wood', 'houten|hout'),
    names: names('fa', 'wooden', 'houten'),
    nlE: 'houten',
  },
}

export interface ColourTerm extends Term {
  hex: string
  nlE: string
}

export type ColourId =
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'pink'
  | 'purple'
  | 'orange'
  | 'black'
  | 'white'
  | 'turquoise'

export const COLOUR_TERMS: Record<ColourId, ColourTerm> = {
  red: { words: words('piros|voros', 'red|crimson', 'rood|rode'), names: names('piros', 'red', 'rood'), hex: '#e0202c', nlE: 'rode' },
  blue: { words: words('kek', 'blue|navy', 'blauw|blauwe'), names: names('kék', 'blue', 'blauw'), hex: '#2f5cff', nlE: 'blauwe' },
  green: { words: words('zold', 'green|lime', 'groen|groene'), names: names('zöld', 'green', 'groen'), hex: '#2fbf5a', nlE: 'groene' },
  yellow: { words: words('sarga', 'yellow', 'geel|gele'), names: names('sárga', 'yellow', 'geel'), hex: '#f7d12e', nlE: 'gele' },
  pink: { words: words('rozsaszin|pink', 'pink', 'roze'), names: names('rózsaszín', 'pink', 'roze'), hex: '#ff6fb1', nlE: 'roze' },
  purple: { words: words('lila|viola', 'purple|violet', 'paars|paarse'), names: names('lila', 'purple', 'paars'), hex: '#8b4cf0', nlE: 'paarse' },
  orange: { words: words('narancs', 'orange', 'oranje'), names: names('narancssárga', 'orange', 'oranje'), hex: '#ff7a1a', nlE: 'oranje' },
  black: { words: words('fekete', 'black', 'zwart|zwarte'), names: names('fekete', 'black', 'zwart'), hex: '#18181c', nlE: 'zwarte' },
  white: { words: words('feher', 'white', 'wit|witte'), names: names('fehér', 'white', 'wit'), hex: '#f2efe8', nlE: 'witte' },
  turquoise: { words: words('turkiz', 'turquoise|cyan|teal', 'turquoise'), names: names('türkiz', 'turquoise', 'turquoise'), hex: '#1fd0c4', nlE: 'turquoise' },
}

/** Adjectives that set the whole mood of a piece rather than one part of it. */
export type VibeWord = 'luxury' | 'futuristic' | 'corporate'
export const VIBE_TERMS: Record<VibeWord, AdjectiveTerm> = {
  luxury: {
    words: words('luxus|dragan|draga|elit|pazar|extravagans', 'luxury|luxurious|expensive|fancy|premium|posh|rich|bling', 'luxe|duur|dure|chique|rijk'),
    names: names('luxus', 'luxury', 'luxe'),
    nlE: 'luxe',
  },
  futuristic: {
    words: words('futurisztikus|jovobeli|cyber|szcifi', 'futuristic|cyber|cyberpunk|sci-fi|scifi|high-tech', 'futuristisch|futuristische|cyber|toekomstig'),
    names: names('futurisztikus', 'futuristic', 'futuristisch'),
    nlE: 'futuristische',
  },
  corporate: {
    words: words('ceges|uzleti|vallalati|cegvezetoi', 'corporate|business', 'zakelijk|zakelijke|bedrijfs'),
    names: names('céges', 'corporate', 'zakelijke'),
    nlE: 'zakelijke',
  },
}

export type ActionId = 'dance' | 'flex' | 'run' | 'fly' | 'work' | 'sit' | 'box' | 'drive'
export const ACTION_POSE: Record<ActionId, Pose> = {
  dance: 'dance',
  flex: 'flex',
  run: 'run',
  fly: 'fly',
  work: 'work',
  sit: 'sit',
  box: 'box',
  drive: 'drive',
}
export const ACTION_TERMS: Record<ActionId, Term & { ing: Names }> = {
  dance: {
    words: words('tancol|tanc', 'dancing|dance|dances|dancer|disco', 'dansend|dansen|danst|danser'),
    names: names('táncol', 'dance', 'dansen'),
    ing: names('táncoló', 'dancing', 'dansende'),
  },
  flex: {
    words: words('izomkod|pozol', 'flexing|flex|flexes|posing', 'flexen|poseren|poseert'),
    names: names('pózol', 'flex', 'flexen'),
    ing: names('pózoló', 'flexing', 'flexende'),
  },
  run: {
    words: words('fut|rohan|szalad', 'running|runs|run|sprinting', 'rennend|rennen|rent|sprinten'),
    names: names('fut', 'run', 'rennen'),
    ing: names('futó', 'running', 'rennende'),
  },
  fly: {
    words: words('repul|szall|lebeg', 'flying|flies|fly|floating|hovering', 'vliegend|vliegen|vliegt|zwevend'),
    names: names('repül', 'fly', 'vliegen'),
    ing: names('repülő', 'flying', 'vliegende'),
  },
  work: {
    words: words('dolgoz|munkal', 'working|works|work', 'werkend|werken|werkt'),
    names: names('dolgozik', 'work', 'werken'),
    ing: names('dolgozó', 'working', 'werkende'),
  },
  sit: {
    words: words('=ul|ulo', 'sitting|sits|seated', 'zittend|zitten|zit'),
    names: names('ül', 'sit', 'zitten'),
    ing: names('ülő', 'sitting', 'zittende'),
  },
  box: {
    words: words('bokszol', 'boxing', 'boksend|boksen|bokst'),
    names: names('bokszol', 'box', 'boksen'),
    ing: names('bokszoló', 'boxing', 'boksende'),
  },
  drive: {
    words: words('vezet|vezetve|vezeto|pilotal|versenyez|hajt', 'driving|drives|drive|riding|rides|piloting|steering|racing', 'bestuurt|besturen|rijdt|rijden|rijdend|stuurt|racen'),
    names: names('vezet', 'drive', 'besturen'),
    ing: names('vezető', 'driving', 'rijdende'),
  },
}

export const MADE_FROM: Words = words(
  'keszult|keszitett|epult|alkotott|epitett',
  'made from|made of|made out of|built from|built out of|crafted from|based on',
  'gemaakt van|gemaakt uit|gebouwd van|gebouwd uit|opgebouwd uit',
)
export const TURNED_INTO: Words = words(
  'atalakult|atalakitott|atalakitva|valtozott|lett|valik|alakult|alakitott',
  'transformed into|turned into|converted into|changed into|morphed into|turns into|becomes|became|upgraded into|rebuilt as',
  'omgebouwd tot|omgebouwd naar|veranderd in|getransformeerd|verandert in|omgetoverd|omgebouwd',
)
export const HEAD_WORDS: Words = words('fej|fejjel|fejen', 'head', 'hoofd')
export const CONQUER_WORDS: Words = words(
  'hodit|uralkod|meghodit|vilaguralom',
  'conquer|conquering|conquers|dominate|dominating|take over|rule',
  'veroveren|verovert|overheersen|overnemen|heersen',
)

export const STOP_WORDS = new Set(
  (
    'a an the of with and in on for as to by is are that who which trying try tries while its it his her their ' +
    'egy az es de het een met en van als die dat aki amely amit amibol rajta van volt lett probal igyekszik ' +
    'fejjel fejen fejet ban ben bol bol val vel nak nek ra re hoz hez ' +
    'zijn haar hun probeert proberen terwijl op aan bij naar uit voor over om te tot wil wilt moet ' +
    'wearing wears wear driving rajta meg akar akarja akarnak alapanyagbol alapanyag kent'
  ).split(' '),
)

export const STYLE_NAMES: Record<StyleId, Names> = {
  absurd: names('Abszurd tárgyak', 'Absurd objects', 'Absurde objecten'),
  creatures: names('Fura lények', 'Weird creatures', 'Rare wezens'),
  machines: names('Lehetetlen gépek', 'Impossible machines', 'Onmogelijke machines'),
  luxury: names('Luxus-nonszensz', 'Luxury nonsense', 'Luxe-onzin'),
  food: names('Dühös ételek', 'Angry food', 'Boos eten'),
  animals: names('Futurisztikus állatok', 'Futuristic animals', 'Futuristische dieren'),
  inventions: names('Véletlen találmányok', 'Random inventions', 'Willekeurige uitvindingen'),
  internet: names('Internetes káosz', 'Internet chaos', 'Internetchaos'),
}

export const LIGHT_NAMES: Record<LightId, Names> = {
  studio: names('Stúdió', 'Studio', 'Studio'),
  dramatic: names('Drámai', 'Dramatic', 'Dramatisch'),
  neon: names('Neon', 'Neon', 'Neon'),
  sunset: names('Naplemente', 'Sunset', 'Zonsondergang'),
  moon: names('Holdfény', 'Moonlight', 'Maanlicht'),
}

export const BACKGROUND_NAMES: Record<BackgroundId, Names> = {
  carbon: names('Karbon', 'Carbon', 'Carbon'),
  red: names('Racing Red', 'Racing Red', 'Racing Red'),
  paper: names('Papír', 'Paper', 'Papier'),
  sunset: names('Naplemente', 'Sunset', 'Zonsondergang'),
  grid: names('Rács', 'Grid', 'Raster'),
  night: names('Éjszaka', 'Night', 'Nacht'),
}

export const CAMERA_NAMES: Record<CameraAngle, Names> = {
  'three-quarter': names('Átlós', 'Three-quarter', 'Driekwart'),
  front: names('Elöl', 'Front', 'Voor'),
  side: names('Oldalt', 'Side', 'Zijkant'),
  top: names('Felülről', 'Top', 'Boven'),
  low: names('Alulról', 'Low', 'Laag'),
  close: names('Közelről', 'Close-up', 'Close-up'),
}

export const MOOD_ORDER: readonly Mood[] = ['happy', 'sad', 'angry', 'surprised', 'sleepy', 'cool', 'scared', 'proud']

export const POSE_NAMES: Record<Pose, Names> = {
  stand: names('Áll', 'Standing', 'Staand'),
  dance: names('Táncol', 'Dancing', 'Dansend'),
  flex: names('Izmot villant', 'Flexing', 'Flexend'),
  drive: names('Vezet', 'Driving', 'Rijdend'),
  work: names('Dolgozik', 'Working', 'Werkend'),
  fly: names('Repül', 'Flying', 'Vliegend'),
  run: names('Fut', 'Running', 'Rennend'),
  sit: names('Ül', 'Sitting', 'Zittend'),
  box: names('Bokszol', 'Boxing', 'Boksend'),
}
