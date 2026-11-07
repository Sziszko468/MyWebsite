// usage: node shots.cjs <port> <outdir> <WxH[,WxH]> <path[,path]> [--full=1] [--theme=dark] [--lang=en] [--mobile=1]
const path = require('path')
const fs = require('fs')
const REPO = require('path').resolve(__dirname, '../../..')
const { start } = require('../serve.cjs')
const { launch, newPage } = require('../lib.cjs')

const [port, outdir, sizesArg, pagesArg, ...rest] = process.argv.slice(2)
const opts = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split('=')))
const sizes = sizesArg.split(',').map((s) => s.split('x').map(Number))
const pages = pagesArg.split(',')
fs.mkdirSync(outdir, { recursive: true })

;(async () => {
  const server = start({ dir: path.resolve(REPO, 'dist'), port: Number(port), headers: true, fallback: '404' })
  const browser = await launch()
  for (const [w, h] of sizes) {
    const mobile = opts.mobile !== '0' && w < 820
    const { context, page } = await newPage(browser, { width: w, height: h, mobile, reduced: true, scheme: opts.theme || 'dark' })
    for (const p of pages) {
      const url = `http://localhost:${port}/${opts.lang || 'en'}${p === '/' ? '/' : p}`
      try {
        await page.goto(url, { waitUntil: 'load' })
        await page.waitForTimeout(opts.wait ? Number(opts.wait) : 1200)
        const name = `${p.replace(/\//g, '_') || '_'}-${w}x${h}.png`
        await page.screenshot({ path: path.join(outdir, name), fullPage: opts.full !== '0' })
        const sw = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth, document.documentElement.scrollHeight])
        console.log(name, 'scrollWidth', sw[0], 'vw', sw[1], 'height', sw[2])
      } catch (e) {
        console.log('FAIL', p, e.message.split('\n')[0])
      }
    }
    await context.close()
  }
  await browser.close()
  server.close && server.close()
  process.exit(0)
})()
