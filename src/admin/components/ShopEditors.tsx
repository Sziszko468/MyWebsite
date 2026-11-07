import { useId, type ReactNode } from 'react'
import { LANGUAGES } from '../../i18n/config'
import { cx } from '../../utils/cx'
import { fill, useInterfaceLanguage, useText } from '../i18n'
import type { DocumentView, Tri } from '../lib/shop'
import styles from '../styles/ui.module.scss'
import { AdminButton } from './AdminButton'
import { TextAreaField, TextField } from './form'
import { Icon } from './Icon'
import { useLanguageName } from './layout'

/**
 * Pieces the two shop editors share: the three-language field, the row of "move up / move down / remove" buttons that reorders a
 * list without dragging (a finger or a keyboard can use them), and the line that says where a document stands.
 */

/** A text in the three languages: one field each, named by language, with the path-keyed server errors shown on the field they belong to. */
export function TriFields({ label, value, onChange, max, multiline = false, required = false, errors, path, hint }: { label: string; value: Tri; onChange: (value: Tri) => void; max: number; multiline?: boolean; required?: boolean; errors: Record<string, string>; path: string; hint?: ReactNode }) {
  const name = useLanguageName()
  const legend = useId()
  return (
    <fieldset className={styles.fieldset} aria-labelledby={legend}>
      <legend id={legend} className={styles.legend}>
        {label}
      </legend>
      {hint && <p className={styles.hint}>{hint}</p>}
      <div className={styles.formGrid}>
        {LANGUAGES.map((code) =>
          multiline ? (
            <TextAreaField key={code} label={name(code)} value={value[code]} rows={3} maxLength={max} lang={code} required={required} error={errors[`${path}.${code}`] ?? null} onChange={(event) => onChange({ ...value, [code]: event.target.value })} />
          ) : (
            <TextField key={code} label={name(code)} value={value[code]} maxLength={max} lang={code} required={required} error={errors[`${path}.${code}`] ?? null} onChange={(event) => onChange({ ...value, [code]: event.target.value })} />
          ),
        )}
      </div>
    </fieldset>
  )
}

/** Up, down and remove for one row of a list; `what` names the row for a screen reader ("Move “Custom components” up"). */
export function RowButtons({ index, count, onMove, onRemove, what, canRemove = true }: { index: number; count: number; onMove: (to: number) => void; onRemove: () => void; what: string; canRemove?: boolean }) {
  const t = useText()
  return (
    <div className={styles.rowButtons} role="group" aria-label={fill(t.shop.actions.rowGroup, { name: what })}>
      <AdminButton variant="text" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={fill(t.shop.actions.moveUp, { name: what })}>
        <Icon name="up" />
      </AdminButton>
      <AdminButton variant="text" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label={fill(t.shop.actions.moveDown, { name: what })}>
        <Icon name="down" />
      </AdminButton>
      {canRemove && (
        <AdminButton variant="text" danger onClick={onRemove} aria-label={fill(t.shop.actions.remove, { name: what })}>
          <Icon name="trash" />
        </AdminButton>
      )}
    </div>
  )
}

/** Where the document stands: published as it is, saved but not published, unsaved, or not published at all. */
export function DocumentStatus({ view, dirty }: { view: DocumentView<unknown>; dirty: boolean }) {
  const t = useText()
  const language = useInterfaceLanguage()
  const state = dirty ? 'unsaved' : view.published === null ? 'notPublished' : view.changed ? 'draftChanged' : 'published'
  const when = view.publishedAt ? new Intl.DateTimeFormat(language === 'hu' ? 'hu-HU' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(view.publishedAt)) : null
  return (
    <p className={cx(styles.documentStatus)} data-state={state} role="status">
      <strong>{t.shop.status[state]}</strong>
      {when && state !== 'notPublished' && <span> · {fill(t.shop.status.publishedAt, { date: when })}</span>}
    </p>
  )
}

/** The three actions on a document, in the page header. */
export function DocumentActions({ busy, dirty, published, onSave, onPublish, onUnpublish }: { busy: 'save' | 'publish' | 'unpublish' | null; dirty: boolean; published: boolean; onSave: () => void; onPublish: () => void; onUnpublish: () => void }) {
  const t = useText()
  return (
    <>
      <AdminButton variant="secondary" onClick={onSave} disabled={!dirty} loading={busy === 'save'} loadingLabel={t.shop.actions.saving}>
        {t.shop.actions.save}
      </AdminButton>
      <AdminButton variant="primary" onClick={onPublish} loading={busy === 'publish'} loadingLabel={t.shop.actions.publishing}>
        {t.shop.actions.publish}
      </AdminButton>
      {published && (
        <AdminButton variant="text" danger onClick={onUnpublish} loading={busy === 'unpublish'}>
          {t.shop.actions.unpublish}
        </AdminButton>
      )}
    </>
  )
}
