// Attributes the bytes of a minified chunk to the source files in its sourcemap.
// usage: node mapsize.cjs <dist dir> [chunk name prefix, default index-] [top N]
const fs = require('fs')
const path = require('path')
const dir = process.argv[2]
const prefix = process.argv[3] || 'index-'
const top = Number(process.argv[4] || 40)
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const lut = Object.fromEntries([...B64].map((c, i) => [c, i]))
function vlq(str) {
  const out = []
  let shift = 0, value = 0
  for (const ch of str) {
    const d = lut[ch]
    value += (d & 31) << shift
    if (d & 32) shift += 5
    else { out.push(value & 1 ? -(value >> 1) : value >> 1); shift = 0; value = 0 }
  }
  return out
}
const files = fs.readdirSync(path.join(dir, 'assets')).filter((f) => f.startsWith(prefix) && f.endsWith('.js'))
for (const f of files) {
  const code = fs.readFileSync(path.join(dir, 'assets', f), 'utf8')
  const map = JSON.parse(fs.readFileSync(path.join(dir, 'assets', f + '.map'), 'utf8'))
  const lines = map.mappings.split(';')
  const sizes = new Map()
  const codeLines = code.split('\n')
  let src = 0
  lines.forEach((line, li) => {
    if (!line) return
    let col = 0
    const segs = line.split(',').map((s) => vlq(s))
    const rows = []
    for (const s of segs) { col += s[0]; if (s.length >= 4) { src += s[1]; rows.push([col, src]) } }
    rows.forEach(([c, sIdx], i) => {
      const end = i + 1 < rows.length ? rows[i + 1][0] : (codeLines[li] || '').length
      const name = map.sources[sIdx].replace(/^.*node_modules\//, 'node_modules/').replace(/^.*MyWebsite\//, '')
      sizes.set(name, (sizes.get(name) || 0) + Math.max(0, end - c))
    })
  })
  const total = [...sizes.values()].reduce((a, b) => a + b, 0)
  console.log(`\n${f}: ${(code.length / 1024).toFixed(1)} kB raw, ${(total / 1024).toFixed(1)} kB attributed`)
  // group by top-level package / folder
  const groups = new Map()
  for (const [n, s] of sizes) {
    const g = n.startsWith('node_modules/') ? n.split('/').slice(0, n.split('/')[1].startsWith('@') ? 3 : 2).join('/') : n.split('/').slice(0, n.startsWith('src/') ? 3 : 2).join('/')
    groups.set(g, (groups.get(g) || 0) + s)
  }
  for (const [g, s] of [...groups].sort((a, b) => b[1] - a[1]).slice(0, top)) console.log(`${(s / 1024).toFixed(1).padStart(7)} kB  ${g}`)
}
