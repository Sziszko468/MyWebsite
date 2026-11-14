import type { DetailBlock } from '../../content/projectDetails/types'
import { useI18n } from '../../i18n/useI18n'
import { Reveal } from '../motion/Reveal'
import { RevealImage } from '../motion/RevealImage'
import styles from './ProjectBlocks.module.scss'

/**
 * The sections the owner added in the administration (PROMPT 22). A block is plain text and pictures with its own heading, drawn as one band
 * after the standard ones. Nothing in a block is ever interpreted as markup (React writes text as text), a text's blank line starts a new
 * paragraph, and a block that has nothing to say in the visitor's language is not drawn: the website never fills the gap with another language.
 */

const BLOCK_IMAGE_SIZES = '(min-width: 66rem) 1056px, 92vw'
const BLOCK_GALLERY_SIZES = '(min-width: 64rem) 30vw, (min-width: 37.5rem) 44vw, 92vw'

const paragraphs = (text: string): string[] => text.split(/\n{2,}/).map((part) => part.trim()).filter((part) => part !== '')

export function BlockBody({ block }: { block: DetailBlock }) {
  const { lang, t } = useI18n()
  switch (block.type) {
    case 'text':
      return (
        <Reveal className={styles.text}>
          {paragraphs(block.body[lang]).map((paragraph, position) => (
            <p key={position}>{paragraph}</p>
          ))}
        </Reveal>
      )
    case 'image':
      return (
        <Reveal>
          <figure className={styles.figure}>
            <RevealImage src={block.picture.src} width={block.picture.width} height={block.picture.height} alt={block.alt[lang]} sizes={BLOCK_IMAGE_SIZES} loading="lazy" decoding="async" className={styles.image} />
            {block.caption[lang] !== '' && <figcaption className={styles.caption}>{block.caption[lang]}</figcaption>}
          </figure>
        </Reveal>
      )
    case 'gallery':
      return (
        <ul className={styles.gallery}>
          {block.images.map((image, position) => (
            <li key={`${image.picture.src}-${position}`}>
              <Reveal delay={Math.min(position, 4) * 60}>
                <figure className={styles.figure}>
                  <RevealImage src={image.picture.src} width={image.picture.width} height={image.picture.height} alt={image.alt[lang]} sizes={BLOCK_GALLERY_SIZES} loading="lazy" decoding="async" className={styles.image} />
                  {image.caption[lang] !== '' && <figcaption className={styles.caption}>{image.caption[lang]}</figcaption>}
                </figure>
              </Reveal>
            </li>
          ))}
        </ul>
      )
    case 'features':
      return (
        <Reveal>
          <ul className={styles.features}>
            {block.items
              .filter((item) => item[lang] !== '')
              .map((item, position) => (
                <li key={position}>{item[lang]}</li>
              ))}
          </ul>
        </Reveal>
      )
    case 'technologies':
      return (
        <Reveal>
          <ul className={styles.technologies} aria-label={t.project.stackLabel}>
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Reveal>
      )
    case 'highlight':
      return (
        <Reveal>
          <p className={styles.highlight}>{block.text[lang]}</p>
        </Reveal>
      )
    case 'links':
      return (
        <Reveal>
          <ul className={styles.links}>
            {block.links
              .filter((link) => link.label[lang] !== '')
              .map((link) => (
                <li key={link.url}>
                  <a href={link.url} target="_blank" rel="noopener noreferrer">
                    {link.label[lang]}
                    <span className="visually-hidden"> {t.a11y.opensInNewTab}</span>
                  </a>
                </li>
              ))}
          </ul>
        </Reveal>
      )
  }
}
