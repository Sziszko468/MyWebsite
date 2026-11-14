import type { ComponentProps } from 'react'
import type { MediaItem, ProjectBlock, ProjectContent } from '../api/projectTypes'
import { useText } from '../i18n'
import { BLOCK_TYPES, LIMITS, emptyBlock, emptyTri, linesToList } from '../lib/projects'
import styles from '../styles/ui.module.scss'
import { AdminButton } from './AdminButton'
import { CheckField, SelectField, TextAreaField, TextField } from './form'
import { Icon } from './Icon'
import { ItemList, PictureBox, TriField } from './ProjectFields'

type TriProps = (path: string, max: number, extra?: { multiline?: boolean; rows?: number }) => Omit<ComponentProps<typeof TriField>, 'label'>

/**
 * The content blocks of a project (PROMPT 22): a small vocabulary of extra sections (a text, a picture, a gallery, a feature list, a
 * technology list, a highlight, external links), each one a band of the project's page with its own heading, in the order shown here. Plain text
 * only. The editor adds, moves and removes blocks; the server checks every one of them again and names the field that is wrong.
 */
export function BlocksEditor({
  blocks,
  hidden,
  onChange,
  triProps,
  picture,
  onPick,
  newKind,
  onNewKind,
  error,
}: {
  blocks: ProjectContent['blocks']
  /** Whether the “Content blocks” section is hidden (the blocks are then not shown to visitors). */
  hidden: boolean
  onChange: (blocks: ProjectContent['blocks']) => void
  triProps: TriProps
  picture: (mediaId: number | null | undefined) => MediaItem | undefined
  /** Opens the picture chooser for a block: `at` is the gallery picture's position, `'new'` to add one, `null` for a single-picture block. */
  onPick: (block: number, at: number | 'new' | null) => void
  newKind: ProjectBlock['type']
  onNewKind: (kind: ProjectBlock['type']) => void
  error: (field: string) => string | null
}) {
  const t = useText()
  const c = t.cms.project.blocks
  const update = (index: number, next: ProjectBlock) => onChange(blocks.map((existing, at) => (at === index ? next : existing)))
  return (
    <div className={styles.stackLg}>
      <p className={styles.hint}>{c.lead}</p>
      {hidden && (
        <p className={styles.notice} role="status">
          <Icon name="info" />
          <span>{c.hiddenNote}</span>
        </p>
      )}
      {blocks.length === 0 && <p className={styles.muted}>{c.empty}</p>}
      <ItemList
        items={blocks}
        onChange={onChange}
        max={LIMITS.blocks}
        itemLabel={c.itemLabel}
        render={(block, index) => (
          <>
            <p className={styles.hint}>
              <strong>{c.types[block.type]}</strong>
            </p>
            <TriField label={c.heading} hint={c.headingHelp} required {...triProps(`blocks.${index}.heading`, 120)} />
            {block.type === 'text' && <TriField label={c.body} {...triProps(`blocks.${index}.body`, 3000, { multiline: true, rows: 6 })} />}
            {block.type === 'highlight' && <TriField label={c.text} {...triProps(`blocks.${index}.text`, 1500, { multiline: true, rows: 3 })} />}
            {block.type === 'image' && (
              <>
                <PictureBox item={picture(block.mediaId)} t={t} onChoose={() => onPick(index, null)} />
                {error(`content.blocks.${index}.mediaId`) && <p className={styles.error}>{error(`content.blocks.${index}.mediaId`)}</p>}
                <TriField label={c.imageAlt} hint={c.imageAltHelp} required {...triProps(`blocks.${index}.alt`, 200)} />
                <TriField label={c.caption} optional {...triProps(`blocks.${index}.caption`, 200)} />
              </>
            )}
            {block.type === 'gallery' && (
              <>
                <ItemList
                  items={block.images}
                  onChange={(images) => update(index, { ...block, images })}
                  max={LIMITS.blockImages}
                  itemLabel={c.picture}
                  render={(image, at) => (
                    <>
                      <PictureBox item={picture(image.mediaId)} t={t} onChoose={() => onPick(index, at)} />
                      <TriField label={c.imageAlt} hint={c.imageAltHelp} required {...triProps(`blocks.${index}.images.${at}.alt`, 200)} />
                      <TriField label={c.caption} optional {...triProps(`blocks.${index}.images.${at}.caption`, 200)} />
                    </>
                  )}
                />
                <div>
                  <AdminButton variant="secondary" onClick={() => onPick(index, 'new')} disabled={block.images.length >= LIMITS.blockImages}>
                    <Icon name="plus" />
                    {c.addImage}
                  </AdminButton>
                </div>
              </>
            )}
            {block.type === 'features' && (
              <ItemList
                items={block.items}
                onChange={(items) => update(index, { ...block, items })}
                max={LIMITS.list}
                create={emptyTri}
                addLabel={c.itemsTri}
                itemLabel={c.itemsTri}
                render={(_, at) => <TriField label={c.itemsTri} {...triProps(`blocks.${index}.items.${at}`, 200)} />}
              />
            )}
            {block.type === 'technologies' && (
              <TextAreaField label={c.technologies} value={block.items.join('\n')} rows={4} onChange={(event) => update(index, { ...block, items: linesToList(event.target.value) })} error={error(`content.blocks.${index}.items`)} />
            )}
            {block.type === 'links' && (
              <>
                <p className={styles.hint}>{c.linkUnverified}</p>
                <ItemList
                  items={block.links}
                  onChange={(links) => update(index, { ...block, links })}
                  max={LIMITS.blockLinks}
                  itemLabel={c.linkLabel}
                  render={(link, at, set) => (
                    <>
                      <TriField label={c.linkLabel} {...triProps(`blocks.${index}.links.${at}.label`, 120)} />
                      <TextField label={c.linkUrl} type="url" inputMode="url" placeholder="https://" value={link.url} onChange={(event) => set({ ...link, url: event.target.value, verified: false })} error={error(`content.blocks.${index}.links.${at}.url`)} />
                      <CheckField label={c.linkVerified} checked={link.verified} onChange={(verified) => set({ ...link, verified })} />
                    </>
                  )}
                />
                <div>
                  <AdminButton variant="secondary" onClick={() => update(index, { ...block, links: [...block.links, { label: emptyTri(), url: '', verified: false }] })} disabled={block.links.length >= LIMITS.blockLinks}>
                    <Icon name="plus" />
                    {c.linkAdd}
                  </AdminButton>
                </div>
              </>
            )}
          </>
        )}
      />
      {blocks.length < LIMITS.blocks && (
        <div className={styles.row}>
          <SelectField label={c.kind} value={newKind} onChange={(event) => onNewKind(event.target.value as ProjectBlock['type'])} options={BLOCK_TYPES.map((kind) => ({ value: kind, label: c.types[kind] }))} />
          <AdminButton variant="primary" onClick={() => onChange([...blocks, emptyBlock(newKind)])}>
            <Icon name="plus" />
            {c.add}
          </AdminButton>
        </div>
      )}
    </div>
  )
}
