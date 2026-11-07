import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { imageVariants } from '../content/imageVariants'
import { srcSetFor } from './responsiveImage'

describe('responsive pictures', () => {
  it('lists the smaller copies in ascending width and ends with the original', () => {
    const set = srcSetFor('/projects/spendly/dashboard-light.webp')!
    expect(set).toBe(
      '/projects/spendly/dashboard-light-480.webp 480w, /projects/spendly/dashboard-light-800.webp 800w, /projects/spendly/dashboard-light.webp 1440w',
    )
  })

  it('gives nothing for a picture without copies, so an uploaded photo loads exactly as before', () => {
    expect(srcSetFor('/media/ab12cd.webp')).toBeUndefined()
    expect(srcSetFor('/projects/unknown.webp')).toBeUndefined()
  })

  it('only names files that exist in public/', () => {
    for (const [src, entry] of Object.entries(imageVariants)) {
      expect(existsSync(join(process.cwd(), 'public', src)), src).toBe(true)
      for (const [, path] of entry.copies) expect(existsSync(join(process.cwd(), 'public', path)), path).toBe(true)
    }
  })

  it('has copies narrower than the original, ascending', () => {
    for (const [src, entry] of Object.entries(imageVariants)) {
      const widths = entry.copies.map(([w]) => w)
      expect(widths, src).toEqual([...widths].sort((a, b) => a - b))
      expect(Math.max(...widths), src).toBeLessThan(entry.width)
    }
  })
})
