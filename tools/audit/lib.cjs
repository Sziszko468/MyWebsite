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
  '/services/packages/launch', '/services/packages/grow', '/services/packages/build', '/services/packages/care',
  '/services/full-experience', '/services/full-experience/start',
  '/services/configure', '/services/cart', '/about', '/lab', '/contact',
  '/work/spendly', '/work/bookinghub', '/work/logistics-platform',
  '/privacy', '/control-room', '/lab/particle-universe', '/lab/liquid-matter', '/lab/type-in-motion', '/lab/infinite-space', '/lab/chromatic-distortion',
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

/**
 * The layout checks of audit-matrix.cjs, run IN the page (so it must stay self-contained): sideways scrolling, elements outside the
 * viewport, text under 11.5px, targets under 24px, the header's controls, upscaled images, the footer. Returns a list of findings.
 */
const layoutCheck = () => {
  const vw = innerWidth
  const out = []
  const root = document.documentElement
  if (root.scrollWidth > vw + 1) out.push(`page scrolls sideways: scrollWidth ${root.scrollWidth} > ${vw}`)
  // anything poking out of the viewport that is not clipped by a scroll container or hidden
  const clipped = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p); if (/(hidden|auto|scroll|clip)/.test(o.overflowX) && p.getBoundingClientRect().width <= vw + 1) return true } return false }
  const poking = []
  for (const e of document.body.querySelectorAll('*')) {
    if (e.closest('[aria-hidden=true], dialog:not([open]), svg, canvas, [hidden]')) continue
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed' && cs.opacity === '0') continue
    const r = e.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if ((r.right > vw + 1 || r.left < -1) && !clipped(e) && (e.textContent || e.tagName === 'IMG' || e.tagName === 'BUTTON' || e.tagName === 'A')) poking.push(`${e.tagName.toLowerCase()}.${String(e.className).slice(0, 24)} [${Math.round(r.left)}..${Math.round(r.right)}] "${(e.textContent || '').trim().slice(0, 20)}"`)
  }
  if (poking.length) out.push(`${poking.length} element(s) outside the viewport: ${poking.slice(0, 3).join(' | ')}`)
  // text that is too small to read
  const small = new Set()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n; (n = walker.nextNode()); ) {
    if (!n.textContent.trim()) continue
    const e = n.parentElement
    if (!e || e.closest('[aria-hidden=true], script, style, noscript, dialog:not([open]), svg, canvas')) continue
    const cs = getComputedStyle(e)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    if (parseFloat(cs.fontSize) < 11.5) small.add(`${e.tagName.toLowerCase()} ${cs.fontSize} "${n.textContent.trim().slice(0, 24)}"`)
  }
  if (small.size) out.push(`text under 11.5px: ${[...small].slice(0, 3).join(' | ')}`)
  // targets
  const tiny = []
  for (const e of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea')) {
    if (e.closest('[aria-hidden=true], dialog:not([open]), [inert]') || e.getClientRects().length === 0) continue
    const r = e.getBoundingClientRect(); const cs = getComputedStyle(e)
    const inline = e.tagName === 'A' && cs.display.startsWith('inline') && e.closest('p, li, dd')
    if (!inline && (r.width < 24 || r.height < 24) && !(e.type === 'radio' || e.type === 'checkbox')) tiny.push(`${e.tagName.toLowerCase()} ${Math.round(r.width)}x${Math.round(r.height)} "${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 18)}"`)
  }
  if (tiny.length) out.push(`${tiny.length} target(s) under 24px: ${tiny.slice(0, 3).join(' | ')}`)
  // header (not on immersive Lab pages): brand + (menu button or nav) + controls visible
  const header = document.querySelector('header')
  if (header && header.getClientRects().length) {
    const vis = [...header.querySelectorAll('a, button')].filter((e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().right <= vw + 1 && e.getBoundingClientRect().left >= -1)
    if (vis.length < 2) out.push(`header shows only ${vis.length} control(s)`)
  }
  // images drawn larger than they are
  for (const img of document.querySelectorAll('img')) if (img.complete && img.naturalWidth && img.clientWidth > img.naturalWidth * 1.05 + 1) out.push(`image upscaled: ${img.src.split('/').pop()} ${img.naturalWidth}px drawn at ${img.clientWidth}px`)
  // footer reachable
  const footer = document.querySelector('footer')
  if (header && !footer) out.push('no footer')
  return out
}

module.exports = { chromium, launch, newPage, axeRun, layoutCheck, LANGS, PAGES, fs, path, SEEN }
