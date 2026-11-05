#!/usr/bin/env node
/**
 * A stricter, quieter keyboard check (PROMPT 15). `audit-keyboard.cjs` identifies a control by its position, which moves when the
 * sticky header changes with scroll, and it looks for the focus ring inside the control's own box: on a page like this it reports
 * the header links as "never focused" and the cards as "without a ring" although both are fine. This one:
 *
 *   - gives every visible, enabled, non-hidden interactive element a number before it starts, so "reached" is exact;
 *   - counts a radio group as ONE stop (the arrow keys move inside it, as the platform intends);
 *   - walks the page with Tab until the order comes round, and lists every element Tab never reached;
 *   - for every stop compares a picture of the control AND its card (the nearest list item or article) with and without focus:
 *     identical pictures mean the visitor cannot see where the focus is.
 *
 *   node tools/audit/audit-keyboard-strict.cjs [dist] [--pages=/en/,/en/services/] [--w=1440] [--h=900] [--mobile=1]
 * Exit 1 on a control Tab does not reach or a stop with no visible change. Tab in a modal dialog is not walked (the dialogs have
 * their own checks: audit-admin.cjs, journeys.cjs).
 */
const path = require('path')
const { start } = require('./serve.cjs')
const { launch, newPage } = require('./lib.cjs')

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split('=')))
const positional = process.argv.slice(2).find((a) => !a.startsWith('--'))
const DIST = path.resolve(positional || path.join(__dirname, '..', '..', 'dist'))
const PAGES = (args.pages || '/en/,/en/services/,/en/services/website/,/en/services/configure/,/en/services/cart/,/en/work/spendly/,/en/about/,/en/contact/,/en/lab/,/en/privacy/').split(',')
const W = Number(args.w || 1440)
const H = Number(args.h || 900)
const MOBILE = args.mobile === '1'

;(async () => {
  const srv = await start({ dir: DIST, port: 4246, fallback: '404', headers: true })
  const browser = await launch()
  const { page } = await newPage(browser, { width: W, height: H, mobile: MOBILE, reduced: true, seen: true })
  let problems = 0
  for (const route of PAGES) {
    await page.goto(srv.url + route, { waitUntil: 'networkidle' })
    await page.waitForTimeout(400)
    const total = await page.evaluate(() => {
      const seenGroups = new Set()
      const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[inert]') && !el.disabled }
      let n = 0
      for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex]:not([tabindex="-1"])')) {
        if (!vis(el) || el.closest('[aria-hidden="true"]') || el.closest('dialog:not([open])')) continue
        if (el.tagName === 'INPUT' && el.type === 'radio') {
          const key = `${el.form ? 'f' : 'n'}:${el.name}`
          if (seenGroups.has(key)) continue
          seenGroups.add(key)
        }
        el.setAttribute('data-kbd', String(n++))
      }
      return n
    })
    const visited = new Map()
    const blind = []
    await page.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur?.() })
    for (let i = 0; i < total + 12; i += 1) {
      await page.keyboard.press('Tab')
      const info = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return null
        const group = el.tagName === 'INPUT' && el.type === 'radio' ? el.name : null
        const card = el.closest('li, article') || el
        const r = el.getBoundingClientRect()
        const c = card.getBoundingClientRect()
        const x0 = Math.min(r.x, c.x), y0 = Math.min(r.y, c.y), x1 = Math.max(r.right, c.right), y1 = Math.max(r.bottom, c.bottom)
        const box = [x0, y0, x1 - x0, y1 - y0]
        let k = el.getAttribute('data-kbd')
        if (k === null && group) { const first = document.querySelector(`input[type=radio][name="${group}"][data-kbd]`); k = first ? first.getAttribute('data-kbd') : null }
        return { k, tag: el.tagName, name: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30), box }
      })
      if (!info) continue
      if (info.k !== null && visited.has(info.k)) break
      if (info.k !== null) visited.set(info.k, info)
      const [bx, by, bw, bh] = info.box
      // The picture is the part of the control and its card that is on screen: the ring runs along the border, so its sides are enough.
      const x0 = Math.max(0, bx - 12), y0 = Math.max(0, by - 12)
      const clip = { x: x0, y: y0, width: Math.min(W, bx + bw + 12) - x0, height: Math.min(H, by + bh + 12) - y0 }
      if (clip.width <= 4 || clip.height <= 4) continue // not on screen at all (a stop inside a closed region): not judged
      const withFocus = await page.screenshot({ clip })
      await page.evaluate(() => document.activeElement?.blur?.())
      const without = await page.screenshot({ clip })
      if (withFocus.equals(without)) blind.push(`${info.tag} "${info.name}"`)
      await page.evaluate((k) => document.querySelector(`[data-kbd="${k}"]`)?.focus({ focusVisible: true }), info.k)
    }
    const missing = []
    for (let k = 0; k < total; k += 1) if (!visited.has(String(k))) missing.push(k)
    const names = await page.evaluate((list) => list.map((k) => { const el = document.querySelector(`[data-kbd="${k}"]`); return `${el.tagName} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"` }), missing)
    const bad = names.length + blind.length
    problems += bad
    console.log(`${route.padEnd(28)} ${String(total).padStart(3)} stops, ${String(visited.size).padStart(3)} reached${names.length ? `, NEVER REACHED: ${names.join('; ')}` : ''}${blind.length ? `, NO VISIBLE CHANGE: ${blind.join('; ')}` : ''}`)
  }
  await browser.close()
  srv.server.close()
  console.log(problems ? `${problems} problem(s) at ${W}x${H}${MOBILE ? ' mobile' : ''}` : `no problem at ${W}x${H}${MOBILE ? ' mobile' : ''}`)
  process.exit(problems ? 1 : 0)
})().catch((error) => { console.error(error); process.exit(2) })
