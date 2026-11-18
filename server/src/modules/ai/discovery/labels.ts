import type { Language } from '../../../config.ts'

/**
 * The words of a discovery plan in the visitor's language, for the ONE place the server has to write them: the quote request the visitor
 * sends (its description and its brief are read by the studio and kept with the request). The website words the same codes for the visitor in
 * its own tables (`src/content/ai/discovery.ts`, checked by the language checks). A plan stores CODES, never these words, so a plan can be shown
 * in any language and the stored enumerations stay untranslated.
 *
 * Every entry has all three languages, and `labels.test` fails if one is missing: there is no fallback to Hungarian or English.
 */

type Tri = Record<Language, string>
const t = (hu: string, en: string, nl: string): Tri => ({ hu, en, nl })

export const TYPES: Record<string, Tri> = {
  portfolio: t('Portfólió / személyes weboldal', 'Portfolio / personal website', 'Portfolio / persoonlijke website'),
  business_site: t('Céges weboldal', 'Business website', 'Bedrijfswebsite'),
  ecommerce: t('Webáruház', 'E-commerce', 'Webwinkel'),
  booking: t('Foglalási platform', 'Booking / reservation platform', 'Boekings- / reserveringsplatform'),
  web_app: t('Webalkalmazás', 'Web application', 'Webapplicatie'),
  saas: t('SaaS-platform', 'SaaS platform', 'SaaS-platform'),
  dashboard: t('Irányítópult / adminisztrációs rendszer', 'Dashboard / admin system', 'Dashboard / beheersysteem'),
  api_backend: t('API / háttérrendszer', 'API / backend development', 'API / backendontwikkeling'),
  redesign: t('Weboldal-újratervezés', 'Website redesign', 'Website-herontwerp'),
  custom_product: t('Egyedi digitális termék', 'Custom digital product', 'Maatwerk digitaal product'),
  other: t('Egyéb / még nem tudom', 'Other / not sure', 'Anders / nog niet zeker'),
}

export const CATEGORIES: Record<string, Tri> = {
  content: t('Tartalom', 'Content', 'Inhoud'),
  design: t('Megjelenés', 'Design', 'Ontwerp'),
  accounts: t('Felhasználók és fiókok', 'Users and accounts', 'Gebruikers en accounts'),
  commerce: t('Értékesítés és fizetés', 'Sales and payments', 'Verkoop en betalingen'),
  booking: t('Foglalás és időpontok', 'Booking and scheduling', 'Boeken en plannen'),
  data: t('Adatok és riportok', 'Data and reports', 'Gegevens en rapporten'),
  integration: t('Integrációk', 'Integrations', 'Integraties'),
  admin: t('Adminisztráció', 'Administration', 'Beheer'),
  communication: t('Kommunikáció és értesítések', 'Communication and notifications', 'Communicatie en meldingen'),
  automation: t('Automatizálás', 'Automation', 'Automatisering'),
  security: t('Biztonság', 'Security', 'Beveiliging'),
  performance: t('Teljesítmény és skálázhatóság', 'Performance and scalability', 'Prestaties en schaalbaarheid'),
  localization: t('Nyelvek és lokalizáció', 'Languages and localisation', 'Talen en lokalisatie'),
  other: t('Egyéb', 'Other', 'Overig'),
}

export const PRIORITIES: Record<string, Tri> = {
  essential: t('Elengedhetetlen', 'Essential', 'Essentieel'),
  important: t('Fontos', 'Important', 'Belangrijk'),
  optional: t('Opcionális', 'Optional', 'Optioneel'),
  future: t('Későbbi megfontolás', 'Future consideration', 'Voor later'),
}

export const STATUSES: Record<string, Tri> = {
  confirmed: t('megerősítve', 'confirmed', 'bevestigd'),
  unconfirmed: t('még nincs megerősítve', 'not yet confirmed', 'nog niet bevestigd'),
}

export const COMPLEXITY_LEVELS: Record<string, Tri> = {
  small: t('kicsi', 'small', 'klein'),
  medium: t('közepes', 'medium', 'gemiddeld'),
  large: t('nagy', 'large', 'groot'),
  complex: t('összetett / egyedi', 'complex / custom', 'complex / maatwerk'),
  unknown: t('még nem megállapítható', 'not known yet', 'nog niet bekend'),
}

export const MAINTENANCE: Record<string, Tri> = {
  none: t('Nem kell fenntartás', 'No maintenance needed', 'Geen onderhoud nodig'),
  occasional: t('Alkalmi módosítások', 'Occasional changes', 'Af en toe aanpassingen'),
  ongoing: t('Folyamatos fenntartás és támogatás', 'Ongoing maintenance and support', 'Doorlopend onderhoud en ondersteuning'),
  unsure: t('Még nem tudom', 'Not sure yet', 'Nog niet zeker'),
}

export const FACTORS: Record<string, Tri> = {
  project_type: t('A projekt típusa', 'The type of project', 'Het soort project'),
  functional_areas: t('Funkcionális területek száma', 'Number of functional areas', 'Aantal functionele gebieden'),
  requirements_volume: t('A követelmények száma', 'Number of requirements', 'Aantal eisen'),
  requirement_complexity: t('Összetett követelmények', 'Demanding requirements', 'Veeleisende eisen'),
  user_roles: t('Felhasználói szerepkörök és jogosultságok', 'User roles and permissions', 'Gebruikersrollen en rechten'),
  data_model: t('Az adatmodell összetettsége', 'Data model complexity', 'Complexiteit van het datamodel'),
  integrations: t('Külső integrációk', 'External integrations', 'Externe integraties'),
  authentication: t('Hitelesítés', 'Authentication', 'Authenticatie'),
  admin_area: t('Adminisztrációs felület', 'Admin functionality', 'Beheerfunctionaliteit'),
  automation: t('Automatizálás', 'Automation', 'Automatisering'),
  localization: t('Nyelvek száma', 'Number of languages', 'Aantal talen'),
  security: t('Biztonsági követelmények', 'Security requirements', 'Beveiligingseisen'),
  third_party: t('Külső szolgáltatásoktól való függés', 'Third-party dependencies', 'Afhankelijkheid van derde partijen'),
  scalability: t('Teljesítmény és skálázhatóság', 'Performance and scalability', 'Prestaties en schaalbaarheid'),
  existing_system: t('Meglévő rendszer átvétele', 'An existing system to take over', 'Een bestaand systeem om over te nemen'),
}

export const ARCHITECTURE: Record<string, Tri> = {
  static_or_prerendered: t('Gyors, többnyire statikus oldalak (előre elkészített oldalak)', 'Fast, mostly static pages, built in advance', 'Snelle, grotendeels statische pagina’s (vooraf opgebouwd)'),
  storefront_app: t('Webáruház-felület kosárral és fizetéssel', 'A storefront with a cart and checkout', 'Een winkelinterface met winkelwagen en afrekenen'),
  app_frontend: t('Interaktív alkalmazás-felület (egyoldalas alkalmazás)', 'An interactive application interface (single-page app)', 'Een interactieve applicatie-interface (single-page app)'),
  rebuild_frontend: t('A meglévő felület megújítása vagy újraépítése a megtartandó tartalommal', 'Refreshing or rebuilding the existing front end around the content to keep', 'Het bestaande front-end vernieuwen of herbouwen rond de te behouden inhoud'),
  no_frontend: t('Nincs külön felhasználói felület (a termék az API)', 'No separate user interface (the API is the product)', 'Geen aparte gebruikersinterface (de API is het product)'),
  frontend_open: t('A felület megközelítése később dől el', 'The front-end approach is decided later', 'De aanpak voor het front-end wordt later bepaald'),
  no_backend: t('Nincs szükség saját háttérrendszerre', 'No back end of its own is needed', 'Een eigen backend is niet nodig'),
  light_backend: t('Könnyű háttérrendszer űrlapokhoz és tartalomkezeléshez', 'A light back end for forms and content management', 'Een lichte backend voor formulieren en contentbeheer'),
  application_backend: t('Alkalmazás-háttérrendszer fiókokkal, adatokkal és munkafolyamatokkal', 'An application back end with accounts, data and workflows', 'Een back-end voor de applicatie met accounts, gegevens en werkstromen'),
  api_service: t('Önálló, dokumentált API-szolgáltatás', 'A standalone, documented API service', 'Een zelfstandige, gedocumenteerde API-service'),
  no_database: t('Nincs szükség adatbázisra', 'No database is needed', 'Een database is niet nodig'),
  relational_database: t('Relációs adatbázis', 'A relational database', 'Een relationele database'),
  relational_with_migrations: t('Relációs adatbázis tervezett sémaváltozásokkal és mentésekkel', 'A relational database with planned schema changes and backups', 'Een relationele database met geplande schemawijzigingen en back-ups'),
  payments: t('Fizetési szolgáltató integrációja', 'A payment provider integration', 'Een integratie met een betaalprovider'),
  email_notifications: t('E-mailes értesítések', 'Email notifications', 'E-mailmeldingen'),
  calendar_sync: t('Naptár-szinkronizálás', 'Calendar synchronisation', 'Agendasynchronisatie'),
  third_party_apis: t('Külső szolgáltatások és API-k összekötése', 'Connections to third-party services and APIs', 'Koppelingen met diensten en API’s van derden'),
  accounting_shipping: t('Számlázási és szállítási rendszerek összekötése', 'Connections to accounting and shipping systems', 'Koppelingen met boekhoud- en verzendsystemen'),
  standard_hardening: t('Alapvédelem: HTTPS, bemeneti ellenőrzés, biztonsági fejlécek', 'Baseline protection: HTTPS, input validation, security headers', 'Basisbeveiliging: HTTPS, controle van invoer en veilige instellingen van de server'),
  authentication_roles: t('Bejelentkezés és szerepkör-alapú jogosultságok', 'Sign-in and role-based permissions', 'Inloggen en rolgebaseerde rechten'),
  payment_review: t('A fizetések kezelésének külön felülvizsgálata', 'A separate review of how payments are handled', 'Een aparte toetsing van de betalingsafhandeling'),
  sensitive_data: t('Érzékeny adatok védelme és az adatkezelés felülvizsgálata', 'Protection of sensitive data and a review of data handling', 'Bescherming van gevoelige gegevens en een toetsing van de gegevensverwerking'),
  regulated_review: t('Szabályozott környezet: külön jogi és megfelelőségi felülvizsgálat', 'A regulated setting: a separate legal and compliance review', 'Een gereguleerde omgeving: een aparte juridische toets en een toets op de naleving van de regels'),
  static_hosting: t('Egyszerű statikus tárhely', 'Simple static hosting', 'Eenvoudige statische hosting'),
  managed_hosting: t('Menedzselt alkalmazás-tárhely mentésekkel és figyeléssel', 'Managed application hosting with backups and monitoring', 'Beheerde applicatiehosting met back-ups en monitoring'),
  scalable_hosting: t('Skálázható tárhelyterv a várt terheléshez', 'A hosting plan that can grow with the expected load', 'Een schaalbaar hostingplan voor de verwachte belasting'),
}

export const REASONS: Record<string, Tri> = {
  no_accounts: t('nincs szükség felhasználói fiókokra', 'no user accounts are needed', 'er zijn geen gebruikersaccounts nodig'),
  accounts: t('felhasználói fiókok kellenek', 'user accounts are needed', 'gebruikersaccounts zijn nodig'),
  many_roles: t('több szerepkör van', 'there are several roles', 'er zijn meerdere rollen'),
  payments: t('fizetés is része a projektnek', 'payments are part of the project', 'betalingen maken deel uit van het project'),
  admin_area: t('adminisztrációs felület kell', 'an admin area is needed', 'een beheeromgeving is nodig'),
  data: t('az adatok kezelése lényeges', 'handling data matters', 'het verwerken van gegevens is belangrijk'),
  integrations: t('külső rendszerekkel kell összekötni', 'it has to connect to other systems', 'het moet koppelen met andere systemen'),
  scalability: t('nagyobb terhelésre kell számítani', 'a higher load is expected', 'een hogere belasting wordt verwacht'),
  sensitive: t('érzékeny vagy szabályozott adatok vannak', 'there is sensitive or regulated data', 'er zijn gevoelige of gereguleerde gegevens'),
  content_site: t('főként tartalom bemutatásáról van szó', 'it is mainly about presenting content', 'het gaat vooral om het tonen van inhoud'),
  existing: t('van már meglévő oldal vagy rendszer', 'something exists already', 'er bestaat al iets'),
  api_only: t('a termék maga az API', 'the API itself is the product', 'de API zelf is het product'),
  not_known: t('még nincs elég információ', 'there is not enough information yet', 'er is nog niet genoeg informatie'),
}

export const PHASES: Record<string, Tri> = {
  discovery_specification: t('Feltárás és specifikáció', 'Discovery and specification', 'Verkenning en specificatie'),
  design: t('UX/UI-tervezés', 'UX/UI design', 'UX/UI-ontwerp'),
  technical_foundation: t('Műszaki alapok', 'Technical foundation', 'Technische basis'),
  content_migration: t('Tartalom és adatok átvétele', 'Migration of content and data', 'Migratie van inhoud en gegevens'),
  core_development: t('Alapfunkciók fejlesztése', 'Core development', 'Kernontwikkeling'),
  additional_functionality: t('További funkciók', 'Additional functionality', 'Aanvullende functionaliteit'),
  testing_optimization: t('Tesztelés és finomhangolás', 'Testing and tuning', 'Testen en verfijnen'),
  deployment: t('Élesítés', 'Deployment', 'Livegang'),
  handover_maintenance: t('Átadás és fenntartás', 'Handover and maintenance', 'Overdracht en onderhoud'),
}

export const RISKS: Record<string, Tri> = {
  missing_facts: t('Még nem tudjuk', 'Not known yet', 'Nog niet bekend'),
  third_party_services: t('Külső szolgáltatások és azok feltételei, díjai', 'Third-party services and their terms and costs', 'Diensten van derden en hun voorwaarden en kosten'),
  payment_provider: t('A fizetési szolgáltató kiválasztása és jóváhagyása', 'Choosing and getting approved with a payment provider', 'Een betaalprovider kiezen en daar goedgekeurd worden'),
  content_delivery: t('A tartalom (szövegek, képek, logó) időben történő átadása', 'Delivering the content (texts, pictures, brand material) on time', 'De inhoud (teksten, beelden, huisstijl) op tijd aanleveren'),
  data_model_complex: t('Összetett adatmodell: a tervezés sok egyeztetést igényel', 'A complex data model: the design needs a lot of agreement', 'Een complex datamodel: het ontwerp vraagt veel afstemming'),
  regulated_security: t('Szabályozott vagy érzékeny adatok: jogi felülvizsgálat kell', 'Regulated or sensitive data: a legal review is needed', 'Gereguleerde of gevoelige gegevens: een juridische toets is nodig'),
  scalability_high: t('Nagy terhelés: a teljesítményt korán meg kell tervezni', 'A high load: performance has to be planned early', 'Hoge belasting: prestaties moeten vroeg worden ingepland'),
  migration: t('A meglévő tartalom és adatok átvétele, a keresési helyezés megőrzése', 'Moving existing content and data and keeping search rankings', 'Bestaande inhoud en gegevens verhuizen en zoekposities behouden'),
  many_roles: t('Sok szerepkör: a jogosultságok pontos meghatározása kell', 'Many roles: the permissions need to be defined precisely', 'Veel rollen: de rechten moeten nauwkeurig worden vastgelegd'),
  automation_extensive: t('Kiterjedt automatizálás: a szabályokat előre tisztázni kell', 'Extensive automation: the rules need to be clarified first', 'Uitgebreide automatisering: de regels moeten eerst worden verduidelijkt'),
  unconfirmed_requirements: t('Meg nem erősített követelmények (javaslatok)', 'Requirements that are not yet confirmed (suggestions)', 'Eisen die nog niet bevestigd zijn (suggesties)'),
  unconfirmed_facts: t('Meg nem erősített, az asszisztens által rögzített adatok', 'Details recorded by the assistant that are not yet confirmed', 'Door de assistent vastgelegde gegevens die nog niet bevestigd zijn'),
  type_unconfirmed: t('A projekt típusa még nincs megerősítve', 'The project type is not yet confirmed', 'Het soort project is nog niet bevestigd'),
  budget_not_a_promise: t('A megadott költségvetési elképzelés nem ígéret: nem jelenti, hogy a projekt ennyiből megvalósítható', 'The budget idea is not a promise: it does not mean the project can be delivered for that amount', 'Het genoemde budget is geen belofte: het betekent niet dat het project daarvoor kan worden opgeleverd'),
  timeline_not_confirmed: t('A kívánt ütemezést a stúdió még nem erősítette meg', 'The wished-for timeline has not been confirmed by the studio', 'De gewenste planning is nog niet door de studio bevestigd'),
  design_direction: t('A megjelenés irányáról még döntést kell hozni', 'A decision on the design direction is still needed', 'Er moet nog een besluit worden genomen over de ontwerprichting'),
  hosting_choice: t('A tárhely és az üzemeltetés kiválasztása', 'A choice of hosting and operation', 'Een keuze voor hosting en beheer'),
  content_ownership: t('Ki gondozza a tartalmat az átadás után', 'Who will maintain the content after handover', 'Wie de inhoud na de overdracht bijhoudt'),
}

export const RISK_KINDS: Record<string, Tri> = {
  missing_info: t('Hiányzó információ', 'Missing information', 'Ontbrekende informatie'),
  external_dependency: t('Külső függőség', 'External dependency', 'Externe afhankelijkheid'),
  technical_risk: t('Műszaki kockázat', 'Technical risk', 'Technisch risico'),
  assumption: t('Meg nem erősített feltevés', 'Unconfirmed assumption', 'Onbevestigde aanname'),
  decision_needed: t('Döntés szükséges', 'Decision needed', 'Besluit nodig'),
}

export const SIGNALS: Record<string, Tri> = {
  roles: t('felhasználói szerepkörök', 'user roles', 'gebruikersrollen'),
  dataModel: t('az adatok szerkezete', 'the structure of the data', 'de structuur van de gegevens'),
  authentication: t('bejelentkezés', 'sign-in', 'inloggen'),
  adminArea: t('adminisztrációs felület', 'an admin area', 'een beheeromgeving'),
  automation: t('automatizálás', 'automation', 'automatisering'),
  security: t('biztonsági és adatvédelmi követelmények', 'security and privacy requirements', 'eisen aan beveiliging en privacy'),
  scalability: t('várható terhelés', 'expected load', 'verwachte belasting'),
}

export const FACTS: Record<string, Tri> = {
  projectName: t('a projekt neve', 'the project name', 'de projectnaam'),
  objective: t('a cél', 'the goal', 'het doel'),
  problem: t('a megoldandó probléma', 'the problem to solve', 'het op te lossen probleem'),
  audience: t('a célközönség', 'the audience', 'de doelgroep'),
  existingSite: t('a meglévő oldal vagy rendszer', 'the existing site or system', 'de bestaande site of het bestaande systeem'),
  budget: t('a költségvetési elképzelés', 'a budget idea', 'een budgetidee'),
  timeline: t('az indulás tervezett ideje', 'the desired launch time', 'het gewenste moment van livegang'),
  maintenance: t('a fenntartási igény', 'the maintenance need', 'de onderhoudsbehoefte'),
}

export const NEXT_STEPS: Record<string, Tri> = {
  review_requirements: t('Nézd át a követelményeket, és erősítsd meg vagy utasítsd el a javaslatokat', 'Review the requirements and confirm or reject the suggestions', 'Loop de eisen na en bevestig of verwerp de suggesties'),
  answer_open_questions: t('Egészítsd ki a hiányzó információkat', 'Fill in the missing information', 'Vul de ontbrekende informatie aan'),
  decide_decisions: t('Gondold át a döntést igénylő kérdéseket', 'Think about the questions that need a decision', 'Denk na over de vragen die een besluit vragen'),
  prepare_content: t('Gyűjtsd össze a már meglévő szövegeket, képeket és példákat', 'Gather the material you already have: texts, pictures, examples', 'Verzamel het materiaal dat je al hebt: teksten, beelden, voorbeelden'),
  send_request: t('Ha rendben van, küldd el az ajánlatkérést a stúdiónak', 'When it looks right, send the request to the studio', 'Als het klopt, stuur de aanvraag naar de studio'),
  studio_reply: t('A stúdió átnézi a kérést, és e-mailben válaszol; ez a terv nem ajánlat és nem megerősített projekt', 'The studio reads the request and replies by email; this plan is not a quote and not a confirmed project', 'De studio leest de aanvraag en antwoordt per e-mail; dit plan is geen offerte en geen bevestigd project'),
}

export const SECTIONS: Record<string, Tri> = {
  overview: t('Áttekintés', 'Overview', 'Overzicht'),
  requirements: t('Követelmények', 'Requirements', 'Eisen'),
  architecture: t('Javasolt architektúra (javaslat, nem döntés)', 'Recommended architecture (a proposal, not a decision)', 'Aanbevolen architectuur (een voorstel, geen besluit)'),
  phases: t('Fejlesztési fázisok', 'Development phases', 'Ontwikkelfasen'),
  risks: t('Kockázatok és függőségek', 'Risks and dependencies', 'Risico’s en afhankelijkheden'),
  next_steps: t('Következő lépések', 'Next steps', 'Volgende stappen'),
}

export const WORDS = {
  discoveryPlan: t('Projektfeltárási terv (nem ajánlat és nem megerősített projekt)', 'Project discovery plan (not a quote and not a confirmed project)', 'Plan uit de projectverkenning (geen offerte en geen bevestigd project)'),
  classification: t('Projekt típusa', 'Project type', 'Soort project'),
  complexity: t('Összetettség', 'Complexity', 'Complexiteit'),
  complexityNote: t('A besorolás a megadott információk alapján készült; nem óra- vagy költségbecslés', 'The level is based on the information given; it is not an estimate of hours or cost', 'Het niveau is gebaseerd op de gegeven informatie; het is geen schatting van uren of kosten'),
  maintenance: t('Fenntartás', 'Maintenance', 'Onderhoud'),
  budget: t('Költségvetési elképzelés (nem ígéret)', 'Budget in mind (not a promise)', 'Budget in gedachten (geen belofte)'),
  timeline: t('Kívánt ütemezés', 'Desired timeline', 'Gewenste planning'),
  version: t('Tervverzió', 'Plan version', 'Planversie'),
  essential: t('Elengedhetetlen követelmények', 'Essential requirements', 'Essentiële eisen'),
  important: t('Fontos követelmények', 'Important requirements', 'Belangrijke eisen'),
  optional: t('Opcionális követelmények', 'Optional requirements', 'Optionele eisen'),
  future: t('Későbbi megfontolások', 'Future considerations', 'Voor later te overwegen'),
  proposal: t('javaslat', 'proposal', 'voorstel'),
  visitorStated: t('te mondtad', 'you said it', 'door jou genoemd'),
  suggestion: t('javaslat', 'suggestion', 'suggestie'),
  stated: t('a látogató mondta', 'stated by the visitor', 'genoemd door de bezoeker'),
  addedByVisitor: t('a látogató vette fel', 'added by the visitor', 'toegevoegd door de bezoeker'),
  assistantSuggestion: t('az asszisztens javaslata', 'suggested by the assistant', 'voorgesteld door de assistent'),
  hostingAndSecurity: t('Hosztolás és biztonság', 'Hosting and security', 'Hosting en beveiliging'),
  frontend: t('Felhasználói felület', 'Front end', 'Front-end'),
  backend: t('Háttérrendszer', 'Back end', 'Backend'),
  database: t('Adatbázis', 'Database', 'Database'),
  integrations: t('Integrációk', 'Integrations', 'Integraties'),
  security: t('Biztonság', 'Security', 'Beveiliging'),
  hosting: t('Tárhely és üzemeltetés', 'Hosting and deployment', 'Hosting en uitrol'),
  notes: t('A látogató megjegyzése', 'The visitor’s note', 'Opmerking van de bezoeker'),
  reasonPrefix: t('mert', 'because', 'omdat'),
  overviewSentence: t('{name}: {type}. Cél: {objective}', '{name}: {type}. Goal: {objective}', '{name}: {type}. Doel: {objective}'),
  unnamed: t('Névtelen projekt', 'Unnamed project', 'Project zonder naam'),
  proposalsLead: t('Javaslatok, nem megerősített műszaki döntések: ', 'Proposals, not confirmed technical decisions: ', 'Voorstellen, geen bevestigde technische besluiten: '),
}

export const label = (table: Record<string, Tri>, code: string, language: Language): string => table[code]?.[language] ?? code
export const word = (key: keyof typeof WORDS, language: Language): string => WORDS[key][language]
