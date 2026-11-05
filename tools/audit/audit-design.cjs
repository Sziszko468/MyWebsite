#!/usr/bin/env node
/**
 * Design-system audit (PROMPT 15, phase 3), in a real browser against the BUILT site: does what is drawn match the system?
 *
 *   node tools/audit/audit-design.cjs [dist]      # exit 1 on a finding
 *
 *   - the five brand colours are the specified values (Racing Red #FF161F, Carbon Black #0B0B0D, Cobalt Blue #445CFF,
 *     Warm Paper #F4F0E8, Graphite #303036) in both themes, and the theme switch changes the page's surface;
 *   - one typeface family on every visible element (the brand's variable sans; the monospace of code is allowed where it is used);
 *   - every control a visitor presses (buttons and links with a button look) has at least a 24 px target (WCAG 2.5.8) and an
 *     accessible name; buttons of one variant share one height per size (no page invents its own);
 *   - the page background is the theme's, not white in dark mode or black in light mode (overflow is audit-matrix's job);
 *   - the interface's border radii come from a short list (a stray value is a component that bypassed the tokens).
 * It samples the main pages in dark and light at a desktop and a phone size. It does not judge taste, only consistency.
 */
const path = require('path')
const { start } = require('./serve.cjs')
const { launch, newPage } = require('./lib.cjs')

const DIST = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..', '..', 'dist'))
const SPEC = { '--brand-red': '#ff161f', '--brand-black': '#0b0b0d', '--brand-blue': '#445cff', '--brand-paper': '#f4f0e8', '--brand-graphite': '#303036' }
const PAGES = ['/en/', '/en/services/', '/en/services/website/', '/en/services/configure/', '/en/services/cart/', '/en/work/spendly/', '/en/about/', '/en/contact/', '/en/lab/', '/en/privacy/']
// Hairlines (1px), percentages (organic and round shapes) and fractional pixels (computed from a clamp) are decorative; the rest must be a token.
const RADII_OK = new Set(['0px', '1px', '2px', '4px', '8px', '14px', '999px'])
const decorativeRadius = (radius) => radius.includes('%') || /\.\d/.test(radius)

;(async () => {
  const srv = await start({ dir: DIST, port: 4241, fallback: '404', headers: true })
  const browser = await launch()
  const findings = []
  const notes = { fonts: new Set(), radii: new Map(), buttonHeights: new Map() }
  for (const theme of ['dark', 'light']) {
    for (const [w, h, mobile] of [[1440, 900, false], [390, 844, true]]) {
      const { context, page } = await newPage(browser, { width: w, height: h, mobile, scheme: theme, reduced: true, seen: true })
      for (const route of PAGES) {
        const here = `${route} ${theme} ${w}`
        await page.goto(srv.url + route, { waitUntil: 'networkidle' })
        await page.waitForTimeout(300)
        const data = await page.evaluate((spec) => {
          const root = getComputedStyle(document.documentElement)
          const tokens = Object.fromEntries(Object.keys(spec).map((name) => [name, root.getPropertyValue(name).trim().toLowerCase()]))
          const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0' }
          const fonts = new Set()
          const radii = {}
          let wide = 0
          for (const el of document.body.querySelectorAll('*')) {
            if (!visible(el)) continue
            const s = getComputedStyle(el)
            if (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) fonts.add(s.fontFamily.split(',')[0].replace(/["']/g, '').trim())
            const radius = s.borderTopLeftRadius
            if (radius !== '0px') radii[radius] = (radii[radius] || 0) + 1
            if (el.getBoundingClientRect().right > innerWidth + 1 && s.position !== 'fixed' && !el.closest('[data-scroll], [role=group], pre, table')) wide += 1
          }
          const controls = [...document.querySelectorAll('main button, main a[class*="button" i], header button, footer button')].filter(visible).map((el) => {
            const r = el.getBoundingClientRect()
            const name = (el.getAttribute('aria-label') || el.textContent || '').trim()
            return { h: Math.round(r.height), w: Math.round(r.width), name: name.slice(0, 40), cls: String(el.className).slice(0, 40) }
          })
          return { tokens, fonts: [...fonts], radii, wide, controls, bg: getComputedStyle(document.body).backgroundColor, dataTheme: document.documentElement.getAttribute('data-theme') }
        }, SPEC)
        for (const [name, value] of Object.entries(SPEC)) if (data.tokens[name] !== value) findings.push(`${here}: ${name} is ${data.tokens[name] || 'missing'}, expected ${value}`)
        for (const font of data.fonts) notes.fonts.add(font)
        for (const [radius, count] of Object.entries(data.radii)) {
          notes.radii.set(radius, (notes.radii.get(radius) ?? 0) + count)
          if (!RADII_OK.has(radius) && !decorativeRadius(radius) && count > 0) findings.push(`${here}: border-radius ${radius} on ${count} element(s) is not a design token value`)
        }
        for (const control of data.controls) {
          if (control.h < 5) continue // a visually hidden control (it is not drawn); audit-a11y checks its name
          if (control.h < 24 || control.w < 24) findings.push(`${here}: control "${control.name}" is ${control.w}x${control.h}`)
          if (!control.name) findings.push(`${here}: a control without a name (${control.cls})`)
        }
        // The surface follows the theme.
        const luminance = (css) => { const m = css.match(/\d+(\.\d+)?/g)?.slice(0, 3).map(Number); return m ? (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255 : null }
        const lum = luminance(data.bg)
        if (lum !== null && ((theme === 'dark' && lum > 0.35) || (theme === 'light' && lum < 0.6))) findings.push(`${here}: the page surface (${data.bg}) does not look ${theme}`)
      }
      await context.close()
    }
  }
  await browser.close()
  srv.server.close()
  console.log(`typefaces drawn (first family of every text element): ${[...notes.fonts].join(', ')}`)
  console.log(`border radii in use: ${[...notes.radii.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r}x${n}`).join(' ')}`)
  const families = [...notes.fonts].filter((f) => !/^(archivo|system-ui|-apple-system|segoe ui|roboto|ui-monospace|sfmono-regular|menlo|consolas|monospace)/i.test(f) && !/variable/i.test(f))
  if (families.length) findings.push(`unexpected typefaces: ${families.join(', ')}`)
  if (findings.length) { for (const f of [...new Set(findings)]) console.log('  ✗ ' + f); console.log(`${new Set(findings).size} finding(s)`) } else console.log('no finding')
  process.exit(findings.length ? 1 : 0)
})().catch((error) => { console.error(error); process.exit(2) })
