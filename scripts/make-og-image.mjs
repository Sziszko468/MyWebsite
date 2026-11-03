// Draws public/og/default.png, the picture shared with every link (Open Graph / Twitter card, 1200x630).
// It is abstract on purpose: red streaks of light and a full stop on carbon black, the site's own motif, and no
// words, so it never has to change when the brand name, a title or a language does.
// Run:  node scripts/make-og-image.mjs      (no dependencies; the PNG is written with Node's zlib)
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { crc32, deflateSync } from 'node:zlib'

const W = 1200
const H = 630
const out = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'public', 'og', 'default.png')

// Brand colours (src/styles/tokens.css)
const BLACK = [11, 11, 13]
const RED = [255, 22, 31]
const BLUE = [68, 92, 255]
const PAPER = [244, 240, 232]

const buf = new Float32Array(W * H * 3)
for (let i = 0; i < W * H; i++) buf.set(BLACK, i * 3)

const smooth = (edge0, edge1, x) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}
const over = (index, color, alpha) => {
  for (let c = 0; c < 3; c++) buf[index + c] = buf[index + c] * (1 - alpha) + color[c] * alpha
}

// A soft red light behind the full stop, then a gentle vignette.
function glow(cx, cy, radius, color, strength) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - cx, y - cy) / radius
      if (d < 1) over((y * W + x) * 3, color, strength * (1 - d) ** 2)
    }
  }
}

// A streak: a tapered line from (x0, y0) along `angle`, thick at its head (t = 0) and fading to nothing at its tail.
function streak({ x0, y0, length, angle, width, color, alpha }) {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const reach = width + 2
  const minX = Math.max(0, Math.floor(Math.min(x0, x0 + dx * length) - reach))
  const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x0 + dx * length) + reach))
  const minY = Math.max(0, Math.floor(Math.min(y0, y0 + dy * length) - reach))
  const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y0 + dy * length) + reach))
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5 - x0
      const py = y + 0.5 - y0
      const along = px * dx + py * dy
      if (along < 0 || along > length) continue
      const t = along / length
      const across = Math.abs(-px * dy + py * dx)
      const half = (width / 2) * (1 - t) ** 0.7
      const coverage = 1 - smooth(half - 0.75, half + 0.75, across)
      if (coverage <= 0) continue
      over((y * W + x) * 3, color, alpha * coverage * (1 - t) ** 0.55 * smooth(0, 0.04, t))
    }
  }
}

glow(930, 330, 620, RED, 0.2)

// Deterministic pseudo-random, so the picture is the same every time the script runs.
let seed = 20261102
const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)

const ANGLE = (-14 * Math.PI) / 180
for (let i = 0; i < 46; i++) {
  const lane = random()
  const color = lane < 0.62 ? RED : lane < 0.9 ? PAPER : BLUE
  streak({
    x0: 120 + random() * 900,
    y0: 40 + random() * 560,
    length: 160 + random() * 520,
    angle: ANGLE + (random() - 0.5) * 0.05,
    width: 1.4 + random() * (color === RED ? 11 : 4),
    color,
    alpha: color === RED ? 0.5 + random() * 0.45 : 0.18 + random() * 0.3,
  })
}
// A few bold red bars, the favicon's slanted stroke, at the head of the flow.
for (const [x0, y0, length, width] of [[250, 170, 620, 26], [330, 345, 700, 40], [520, 500, 520, 22]]) {
  streak({ x0, y0, length, angle: ANGLE, width, color: RED, alpha: 1 })
}

// The full stop: the red dot that ends the site's headlines.
const cx = 1010
const cy = 440
const radius = 50
glow(cx, cy, 190, RED, 0.35)
for (let y = cy - radius - 2; y <= cy + radius + 2; y++) {
  for (let x = cx - radius - 2; x <= cx + radius + 2; x++) {
    const coverage = 1 - smooth(radius - 0.75, radius + 0.75, Math.hypot(x + 0.5 - cx, y + 0.5 - cy))
    if (coverage > 0) over((y * W + x) * 3, RED, coverage)
  }
}

// Vignette, then an ordered dither (a fixed 8x8 pattern, not random noise) so the dark gradients do not band
// and the file still compresses well.
const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21]
const pixels = new Uint8Array(W * H * 3)
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const d = Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2))
    const shade = 1 - 0.38 * smooth(0.55, 1.35, d)
    const threshold = (BAYER[(y % 8) * 8 + (x % 8)] + 0.5) / 64
    for (let c = 0; c < 3; c++) {
      const value = buf[(y * W + x) * 3 + c] * shade
      pixels[(y * W + x) * 3 + c] = Math.max(0, Math.min(255, Math.floor(value + threshold)))
    }
  }
}

// PNG scanlines: each row takes whichever of the five filters leaves the smallest sum of magnitudes.
const BPP = 3
const paeth = (a, b, c) => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}
const rows = []
for (let y = 0; y < H; y++) {
  const candidates = []
  for (let type = 0; type < 5; type++) {
    const row = Buffer.alloc(1 + W * BPP)
    row[0] = type
    for (let i = 0; i < W * BPP; i++) {
      const raw = pixels[y * W * BPP + i]
      const left = i >= BPP ? pixels[y * W * BPP + i - BPP] : 0
      const up = y > 0 ? pixels[(y - 1) * W * BPP + i] : 0
      const upLeft = y > 0 && i >= BPP ? pixels[(y - 1) * W * BPP + i - BPP] : 0
      const predicted = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][type]
      row[1 + i] = (raw - predicted) & 255
    }
    let cost = 0
    for (let i = 1; i < row.length; i++) cost += row[i] < 128 ? row[i] : 256 - row[i]
    candidates.push({ row, cost })
  }
  rows.push(candidates.sort((a, b) => a.cost - b.cost)[0].row)
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}
const header = Buffer.alloc(13)
header.writeUInt32BE(W, 0)
header.writeUInt32BE(H, 4)
header.set([8, 2, 0, 0, 0], 8) // 8-bit RGB, no interlace
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])
await mkdir(dirname(out), { recursive: true })
await writeFile(out, png)
console.log(`wrote ${out} (${(png.length / 1024).toFixed(0)} kB, ${W}x${H})`)
