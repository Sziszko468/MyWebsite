import { tri } from '../trilingual'

/** The title and description of the shop's pages (browser tab, search result, shared link). Kept apart so the page frame can read them without loading the shop's text. */

export const shopMeta = {
  landing: {
    title: tri('Szolgáltatások és csomagok', 'Services and packages', 'Diensten en pakketten'),
    description: tri(
      'Weboldalak, webalkalmazások, UI-megvalósítás és integrációk: szolgáltatások, négy csomag, összeállító és egyedi ajánlatkérés.',
      'Websites, web applications, UI implementation and integrations: services, four packages, a request builder and a custom quote request.',
      'Websites, webapplicaties, UI-implementatie en integraties: diensten, vier pakketten, een aanvraagbouwer en een offerteaanvraag op maat.',
    ),
  },
  configurator: {
    title: tri('Ajánlatkérés összeállítása', 'Build your quote request', 'Stel je offerteaanvraag samen'),
    description: tri(
      'Hat rövid lépésben összeállíthatod, mire van szükséged, és egyedi ajánlatot kérhetsz.',
      'Put together what you need in six short steps and ask for a custom quote.',
      'Stel in zes korte stappen samen wat je nodig hebt en vraag een offerte op maat aan.',
    ),
  },
  fullExperience: {
    title: tri('FULL EXPERIENCE: az ötletedtől a kész digitális termékig', 'FULL EXPERIENCE: your idea, built from zero', 'FULL EXPERIENCE: jouw idee, vanaf nul gebouwd'),
    description: tri(
      'Teljes weboldal vagy alkalmazás fejlesztése nulláról: a koncepciótól és a tervezéstől a fejlesztésen át az éles indulásig. Egyedi ajánlat, fix ár nélkül.',
      'A complete website or application built from scratch: from the concept and the design, through development, to launch. A custom quote, with no fixed price.',
      'Een complete website of applicatie vanaf nul gebouwd: van concept en ontwerp, via ontwikkeling, tot livegang. Een offerte op maat, zonder vaste prijs.',
    ),
  },
  fullExperienceStart: {
    title: tri('FULL EXPERIENCE: a projekted összeállítása', 'FULL EXPERIENCE: set up your project', 'FULL EXPERIENCE: stel je project samen'),
    description: tri(
      'Néhány rövid kérdés a projektedről, és személyre szabott ajánlatot kérhetsz.',
      'A few short questions about your project, and you can ask for a tailored proposal.',
      'Een paar korte vragen over je project en je kunt een voorstel op maat aanvragen.',
    ),
  },
  cart: {
    title: tri('Kosár', 'Cart', 'Winkelmand'),
    description: tri(
      'A kiválasztott szolgáltatások áttekintése és módosítása, majd ajánlatkérés. Fizetés nincs: a bolt ajánlatkéréssel működik.',
      'Review and edit your selected services, then request a quote. There is no payment: this shop works by inquiry.',
      'Bekijk en wijzig je gekozen diensten en vraag daarna een offerte aan. Er is geen betaling: deze winkel werkt via een aanvraag.',
    ),
  },
}
