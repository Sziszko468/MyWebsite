import type { DetailBlock } from '../../content/projectDetails/types'
import type { Language } from '../../i18n/config'

/** Whether a block has a heading and something to show in a language. A block without either is left out of the page. */
export function blockShows(block: DetailBlock, lang: Language): boolean {
  if (block.heading[lang] === '') return false
  switch (block.type) {
    case 'text':
      return block.body[lang] !== ''
    case 'image':
      return true
    case 'gallery':
      return block.images.length > 0
    case 'features':
      return block.items.some((item) => item[lang] !== '')
    case 'technologies':
      return block.items.length > 0
    case 'highlight':
      return block.text[lang] !== ''
    case 'links':
      return block.links.some((link) => link.label[lang] !== '')
  }
}

/** The blocks to draw in a language, each with its position among all the blocks (a stable key and anchor). */
export function visibleBlocks(blocks: readonly DetailBlock[] | undefined, lang: Language): Array<{ block: DetailBlock; index: number }> {
  return (blocks ?? []).flatMap((block, index) => (blockShows(block, lang) ? [{ block, index }] : []))
}
