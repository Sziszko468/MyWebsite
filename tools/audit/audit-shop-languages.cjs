// PROMPT 18, test F (layout): every Shop page x 3 languages x the nine widths of the brief, no sideways scroll, nothing outside the
// viewport, no unreadable text or tiny targets. Against any server of the built site (for example `npx wrangler dev --port 8799`):
//   AUDIT_PLAYWRIGHT=/path/to/playwright node tools/audit/audit-shop-languages.cjs [http://127.0.0.1:8799]
const { launch, layoutCheck, SEEN } = require('./lib.cjs')
const BASE = process.argv[2] || 'http://127.0.0.1:8799'
const WIDTHS = [320, 360, 390, 430, 768, 1024, 1366, 1440, 1920]
const PAGES = ['/services/', '/services/website/', '/services/webapp/', '/services/ui/', '/services/integrations/', '/services/packages/launch/', '/services/packages/grow/', '/services/packages/build/', '/services/packages/care/', '/services/full-experience/', '/services/full-experience/start/', '/services/configure/', '/services/cart/']
const LANGS = ['hu', 'en', 'nl']
const heightOf = (w) => (w < 768 ? 800 : w < 1366 ? 1024 : 900)

;(async () => {
  const browser = await launch()
  const findings = []
  let loads = 0
  for (const scheme of ['dark', 'light']) {
    const widths = scheme === 'dark' ? WIDTHS : [360, 768, 1440]
    for (const width of widths) {
      const context = await browser.newContext({ viewport: { width, height: heightOf(width) }, isMobile: width < 768, hasTouch: width < 768, deviceScaleFactor: width < 768 ? 2 : 1, reducedMotion: 'reduce', colorScheme: scheme })
      await context.addInitScript(SEEN)
      const page = await context.newPage()
      for (const lang of LANGS) {
        for (const path of PAGES) {
          await page.goto(`${BASE}/${lang}${path}`, { waitUntil: 'networkidle' })
          await page.waitForTimeout(220)
          // scroll once so lazily revealed parts exist
          await page.evaluate(async () => {
            for (let y = 0; y < document.body.scrollHeight; y += 600) {
              window.scrollTo({ top: y, behavior: 'instant' })
              await new Promise((resolve) => setTimeout(resolve, 20))
            }
            window.scrollTo({ top: 0, behavior: 'instant' })
          })
          const problems = await page.evaluate(layoutCheck)
          loads += 1
          for (const problem of problems) findings.push(`${lang}${path} @${width} ${scheme}: ${problem}`)
        }
      }
      await context.close()
    }
  }
  await browser.close()
  console.log(`${loads} page loads (${PAGES.length} pages x 3 languages x ${WIDTHS.length} widths dark + 3 widths light), ${findings.length} findings`)
  const unique = [...new Set(findings.map((line) => line.replace(/^[^ ]+ @\d+ \w+: /, '')))]
  for (const line of findings.slice(0, 60)) console.log(' -', line)
  console.log(`distinct kinds: ${unique.length}`)
  process.exit(findings.length ? 1 : 0)
})().catch((error) => {
  console.error(error)
  process.exit(2)
})
