import type { Language } from '../config'

/**
 * Words the spell checker must accept although no general dictionary knows them. Every list below says WHY its words are
 * here; a word goes in after somebody looked at it in its sentence and decided it is right. A misspelling never goes in to
 * make a run pass: the text is fixed instead (the first run of this check found, for example, "Eén" for "Één" 15 times and
 * "democedrijf" for "demobedrijf").
 *
 * The reviewer who read these lists is the same assistant that wrote the check: they are an automated tool's allow-list,
 * not a native speaker's judgement, and the report says so. Everything is lower case.
 */

/** Names and short words of the site itself: the owner's names, the packages, the Lab, the assistant, products and standards. */
const names = [
  'launch', 'grow', 'build', 'care', 'full', 'experience', 'controlled', 'chaos', 'racing', 'control', 'room', 'lab', 'glitch', 'liquid', 'matter',
  'serif', 'type', 'motion', 'warpsprong', 'spendly', 'bookinghub', 'logistics', 'hollandia', 'kezdőknek', 'nfsu2', 'cloudflare', 'resend',
  'anthropic', 'claude', 'haiku', 'gemini', 'github', 'figma', 'stripe', 'wordpress', 'shopify', 'woocommerce', 'webflow', 'wix', 'squarespace',
  'django', 'djangóval', 'fastapi', 'postgresql', 'sqlite', 'redis', 'docker', 'nginx', 'swagger', 'celery', 'react', 'typescript', 'javascript', 'vite',
  'node', 'nodejs', 'next', 'expo', 'native', 'tailwind', 'playwright', 'webgl', 'glsl', 'three', 'openapi', 'yaml', 'apns', 'fcm',
  // The standards the privacy notice names: "Global Privacy Control", "Do Not Track".
  'global', 'privacy', 'not', 'track',
]

/** Everyday abbreviations and shortened forms. */
const abbreviations = ['seo', 'api', 'ui', 'ux', 'cms', 'faq', 'url', 'html', 'css', 'json', 'ssl', 'https', 'gdpr', 'vat', 'btw', 'áfa', 'wcag', 'aria', 'pdf', 'csv', 'ai', 'qa', 'ci', 'crm', 'erp', 'saas', 'mvp', 'b2b', 'b2c', 'ocr', 'ecb', 'jwt', 'totp', 'fff', 'bijv', 'incl', 'excl', 'e-mail', 'email', 'mail']

/**
 * Technical vocabulary of the project case studies and the Lab. These pages describe real code, so they name real parts of it
 * (a database, a protocol, a library, a command) in the English that engineers use in all three languages.
 */
const technical = [
  'actions', 'adapter', 'appointments', 'auth', 'cmd', 'compose', 'config', 'ctrl', 'degraded', 'dependencies', 'floating', 'floats', 'hook', 'hooks',
  'hookok', 'hookot', 'hookon', 'jitter', 'keychain', 'keystore', 'lang', 'layout', 'layouts', 'number', 'offset', 'origin', 'placeholder', 'placeholders',
  'point', 'protected', 'queryset', 'querysets', 'querysetek', 'refetches', 'repositories', 'repository', 'root', 'scheduler', 'scroll', 'seed', 'serializers',
  'shader', 'shaderrel', 'shift', 'sortable', 'src', 'swappable', 'timeout', 'tooltips', 'unavailable', 'uptime', 'users', 'vertex', 'waypoints', 'worker',
  'wrappers', 'send-email', 'email-status', 'if-match', 'blacklist', 'bottom', 'client', 'clients', 'commit', 'constraints', 'face', 'content', 'site',
  'dialogs', 'biometric', 'runnable', 'tooltips', 'integrations', 'webhook', 'apis', 'api’s', 'api\'s', 'id’s', 'id\'s', 'add-ons', 'add-on',
]

/**
 * Correct words that the Hunspell dictionaries do not produce. The Hungarian dictionary leaves out many regular inflected
 * forms (accusatives such as "tervet", "szöveget", plurals such as "csomagok", personal forms such as "nekem"); the Dutch one
 * leaves out compound words that are spelled correctly (winkelmandpagina, datagedreven). Each word was read in its sentence.
 */
const hungarianForms = [
  'általunk', 'álnéven', 'ből', 'csomagok', 'csomagokat', 'csomagokból', 'csomagon', 'háttéren', 'határon', 'igazságok', 'jogosultságok',
  'jogosultságokat', 'kérdőívet', 'költséget', 'lehetőséget', 'minőséget', 'nekem', 'neked', 'néven', 'nyelven', 'nyelvet', 'őket', 'összeget',
  'összegzés', 'papírokról', 'sávokat', 'sávokkal', 'sebességet', 'sorok', 'sorokat', 'sorokra', 'soronként', 'szállítólevelen', 'szerveren',
  'szöveget', 'szövegen', 'tableten', 'tanulságok', 'tervet', 'től', 'tulajdonságok', 'újdonságokról', 'fuvarokat', 'adminisztrátorok', 'demócéget',
  'buildet', 'commitját', 'commit-előzmények', 'celery-feladatok', 'full-stack', 'boxutcába', 'reszponzív', 'reszponzívan', 'reszponzívvá',
  'labba', 'labban', 'labhoz', 'lab-élmény', 'matterben', 'motionben', 'admin', 'push', 'push-értesítések', 'push-ellenőrzések',
  'backend', 'frontend', 'backend-kép', 'ecb-referenciaárfolyammal', 'fetch-burkoló', 'szerializálók', 'zsályazöld',
]

const dutchWords = [
  'winkelmandpagina', 'datagedreven', 'ontwikkelaarspositie', 'browsertabblad', 'spammap', 'frontendontwikkeling', 'backendontwikkeling', 'backendtools',
  'backendimage', 'toetsenbordgebruik', 'toetsenbordvriendelijke', 'toegangstokens', 'rolgebaseerde', 'rolcontrole', 'offlinewachtrij', 'offlinemodus',
  'auditlog', 'chauffeursapp', 'native-chauffeursapp', 'statusworkflow', 'zendingsworkflow', 'eigenaarschapscontroles', 'extractiehulpmiddel',
  'wegtransportbedrijf', 'tweefactoraanmelding', 'tweefactoraanmelden', 'tweefactorauthenticatie', 'regelgecontroleerde', 'saliegroen', 'rijvergrendeling',
  'deploymentpijplijn', 'commitgeschiedenis', 'foutafhandelende', 'fetch-wrapper', 'idempotent', 'idempotente', 'gecommit', 'gecachte', 'providersleutel',
  'pushbezorging', 'pushcontroles', 'sorteerbaar', 'sorteerbare', 'normaliseerfunctie', 'number-invoer', 'inboxscherm', 'sync-statuseindpunt',
  'onderbalk', 'telefoonlayout', 'containerqueries', 'placeholder-marketingtekst', 'debuglogging', 'auth-fixes', 'webbuild', 'webbel', 'clientservices',
  'client-id', 'expo-webdoel', 'celery-taken', 'playwright-tests', 'readiness-check', 'refresh-token', 'refresh-tokens', 'restrict-constraints',
  'unique-constraints', 'actions-workflow', 'append-only', 'bonfoto', 'compose-opdracht', 'tiebreaker', 'full-stackdemonstratie', 'full-stackengineering',
  'full-stack', 'beschikbaarheids', 'boekings', 'designtokens', 'psst', 'streefdatum', 'browser-end-to-endtests', 'vertex-shader', 'queries', 'skeletons', 'aanwijzerreactie',
]

export const allowedWords: Record<Language, Set<string>> = {
  hu: new Set([...names, ...abbreviations, ...technical, ...hungarianForms]),
  en: new Set([...names, ...abbreviations, ...technical, 'refuellings', 'else’s', 'else\'s', 'frontend', 'backend', 'webshop', 'webshops', 'onboarding', 'workflow', 'workflows']),
  nl: new Set([...names, ...abbreviations, ...technical, ...dutchWords, 'webshop', 'webshops', 'frontend', 'backend', 'onboarding', 'workflow', 'workflows', 'zzp’ers', 'zzp\'ers']),
}

/**
 * Hungarian suffixes that follow a hyphen after a foreign word or an acronym ("Control Room AI-ban", "React-tel", "OCR-rel"): the
 * first part is checked as a name, the rest only has to be one of these.
 */
export const hungarianSuffixes = new Set([
  'ban', 'ben', 'ból', 'ből', 'ba', 'be', 'val', 'vel', 'nak', 'nek', 'jal', 'jel', 'rel', 'tel', 'ról', 'ről', 'ra', 're', 'hoz', 'hez', 'höz', 'ig',
  'ként', 'on', 'en', 'ön', 'ot', 'et', 'at', 'ük', 'ja', 'je', 'nál', 'nél', 'tól', 'től', 'ért', 'ul', 'ül',
])

/**
 * Texts the spell checker does not read. These are messages only a developer sees (the keys end in `.pending`: they name a file
 * of the source code and are shown only by the development server), so they are not customer-facing words.
 */
export const spellingSkippedIds: RegExp[] = [/^dict\..*\.pending$/]
