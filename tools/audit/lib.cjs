// Shared helpers for the audit scripts.
const path = require('path')
// Playwright and axe-core are not dependencies of this project: point these at an installation (see README.md).
const PW = process.env.AUDIT_PLAYWRIGHT || 'playwright'
const { chromium } = require(PW)
const axePath = () => process.env.AUDIT_AXE || require.resolve('axe-core/axe.min.js')
const fs = require('fs')

const LANGS = ['hu', 'en', 'nl']
// Every public page (language-free paths), from src/routes/pages.ts
const PAGES = [
  '/', '/work', '/services', '/services/website', '/services/webapp', '/services/ui', '/services/integrations',
  '/services/configure', '/services/cart', '/about', '/lab', '/contact',
  '/work/spendly', '/work/bookinghub', '/work/logistics-platform',
  '/privacy', '/lab/particle-universe', '/lab/liquid-matter', '/lab/type-in-motion', '/lab/infinite-space', '/lab/chromatic-distortion',
]

async function launch(opts = {}) {
  return chromium.launch({ channel: opts.channel || process.env.AUDIT_CHANNEL || 'chrome', headless: true, args: ['--ignore-gpu-blocklist', ...(opts.args || [])] })
}

const SEEN = `try { localStorage.setItem('intro:seen','1'); localStorage.setItem('intro:skip','1') } catch (e) {}`

async function newPage(browser, { width = 1440, height = 900, mobile = false, seen = true, reduced = false, scheme = 'dark', locale, extra = {} } = {}) {
  const context = await browser.newContext({
    viewport: { width, height }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1,
    reducedMotion: reduced ? 'reduce' : 'no-preference', colorScheme: scheme, locale, ...extra,
  })
  if (seen) await context.addInitScript(SEEN)
  const page = await context.newPage()
  return { context, page }
}

async function axeRun(page, tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']) {
  // Evaluated through the protocol, not added as a <script>: the page keeps its real Content-Security-Policy, which refuses an inline script.
  if (!(await page.evaluate(() => !!window.axe))) await page.evaluate(fs.readFileSync(axePath(), 'utf8'))
  return page.evaluate(async (tags) => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] })
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 140), summary: n.failureSummary?.split('\n').slice(1, 3).join(' ') })), count: v.nodes.length }))
  }, tags)
}

module.exports = { chromium, launch, newPage, axeRun, LANGS, PAGES, fs, path, SEEN }
