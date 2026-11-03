import { tri } from '../content/trilingual'

/**
 * The few words that only the search and sharing side of the site needs: what the shared picture
 * shows, and what the static HTML says to a visitor whose browser runs no script. Everything a page
 * is called or described by comes from the page's own content (routes/documentMeta.ts).
 */
export const seoText = {
  /** The shared picture is abstract (public/og/default.png); this says what is in it. */
  imageAlt: tri(
    'Piros fénycsíkok sötét háttéren, a mozgás érzetével.',
    'Red streaks of light on a dark background, suggesting speed.',
    'Rode lichtstrepen op een donkere achtergrond, die snelheid suggereren.',
  ),
  /** Shown inside <noscript>: the page is built by script, so without it there is only this. */
  noScript: tri(
    'Ez az oldal JavaScriptet használ a tartalma megjelenítéséhez. Kapcsold be a böngésződben, vagy válassz egy oldalt innen:',
    'This site uses JavaScript to show its content. Turn it on in your browser, or pick a page from here:',
    'Deze site gebruikt JavaScript om de inhoud te tonen. Zet het aan in je browser of kies hier een pagina:',
  ),
  noScriptLanguages: tri('Nyelvek', 'Languages', 'Talen'),
} as const
