import { tri } from '../trilingual'

/** The Control Room page's title and description (browser tab, search result, shared link). Kept apart from the interface words so the page frame can read them without loading them. */
export const aiMeta = {
  title: tri('Control Room AI: kérdezz, tervezz, kérj ajánlatot', 'Control Room AI: ask, plan, request a quote', 'Control Room AI: vraag, plan, vraag een offerte aan'),
  description: tri(
    'Az AI-asszisztens, amely a közzétett projektekből, szolgáltatásokból és csomagokból válaszol, segít megtervezni a digitális termékedet, és jóváhagyásod után ajánlatkérést állít össze.',
    'The AI assistant that answers from the published projects, services and packages, helps you plan your digital product and, once you approve, prepares a quote request.',
    'De AI-assistent die antwoordt op basis van de gepubliceerde projecten, diensten en pakketten, je helpt je digitale product te plannen en, na jouw goedkeuring, een offerteaanvraag klaarzet.',
  ),
}
