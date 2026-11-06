import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { LANGUAGES, type Language } from '../../i18n/config'
import { cx } from '../../utils/cx'
import * as endpoints from '../api/endpoints'
import { ApiError } from '../api/client'
import type { Category, MediaItem, ProjectContent, ProjectDetailData } from '../api/projectTypes'
import { AdminButton } from '../components/AdminButton'
import { useConfirm } from '../components/Confirm'
import { CheckField, SelectField, SwitchField, TextAreaField, TextField } from '../components/form'
import { Icon } from '../components/Icon'
import { DetailPanel, PageHeader, TabPanel, Tabs } from '../components/layout'
import { ItemList, LanguageBar, TriField } from '../components/ProjectFields'
import { MediaPicker } from '../components/MediaPicker'
import { ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import { fill, useInterfaceLanguage, useText } from '../i18n'
import { describeError, fieldErrors } from '../lib/errors'
import { ACCENTS, FEATURE_STATUSES, HEROES, LAYOUTS, LIMITS, MOCKUPS, PROJECT_STATUSES, SECTIONS, STACK_GROUPS, completenessOf, emptyContent, emptyTri, linesToList, sameDocument, setIn, titleOf } from '../lib/projects'
import { useSession } from '../session/SessionProvider'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'

type TabId = 'general' | 'images' | 'descriptions' | 'technical' | 'sections' | 'links' | 'publication'
const TABS: readonly TabId[] = ['general', 'images', 'descriptions', 'technical', 'sections', 'links', 'publication']

interface Draft {
  slug: string
  category: string
  content: ProjectContent
}

/** What the picker is choosing a picture for. */
type Target = { kind: 'thumbnail' } | { kind: 'gallery'; index: number | 'new' } | null

const opts = (values: readonly string[], labels: Record<string, string>) => values.map((value) => ({ value, label: labels[value] ?? value }))

/**
 * The project editor. One document, seven tabs: general, images, descriptions, technical, sections, links and publication. Every
 * text is edited in the language chosen on the language bar, and the marks on the bar follow the typing. Saving writes the draft
 * (the server checks all of it and names every field that is wrong, next to the field); publishing is a separate, confirmed
 * step. Changes that are not saved are guarded against being lost. The preview opens the saved project's own page, with its real
 * layout, for the administrator only.
 */
export function ProjectEditPage() {
  const params = useParams()
  const creating = params.id === undefined || params.id === 'new'
  const id = creating ? null : Number(params.id)
  const t = useText()
  const language = useInterfaceLanguage()
  const session = useSession()

  const project = useResource<ProjectDetailData | null>((signal) => (id === null ? Promise.resolve(null) : endpoints.projects.get(id, signal)), [id])
  const settings = useResource((signal) => endpoints.projects.settings(signal), [])

  if (!session.can('content:write')) return <ErrorState error={new ApiError(403, 'forbidden', '')} level={1} />
  if (project.loading || settings.loading) return <LoadingState />
  if ((project.error && !project.data && id !== null) || (settings.error && !settings.data)) return <ErrorState error={project.error ?? settings.error} onRetry={() => { project.reload(); settings.reload() }} level={1} />

  return <Editor key={id ?? 'new'} initial={project.data} categories={settings.data?.categories ?? []} language={language} onSaved={(saved) => project.set(saved)} t={t} />
}

function Editor({ initial, categories, language, onSaved, t }: { initial: ProjectDetailData | null; categories: Category[]; language: 'hu' | 'en'; onSaved: (data: ProjectDetailData) => void; t: ReturnType<typeof useText> }) {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const session = useSession()
  const startingDraft: Draft = useMemo(() => (initial ? { slug: initial.slug, category: initial.category, content: initial.content } : { slug: '', category: categories[0]?.key ?? '', content: emptyContent() }), [initial, categories])
  const [saved, setSaved] = useState<Draft>(startingDraft)
  const [draft, setDraft] = useState<Draft>(startingDraft)
  const [tab, setTab] = useState<TabId>('general')
  const [editing, setEditing] = useState<Language>('hu')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState<Target>(null)
  const [known, setKnown] = useState<Map<number, MediaItem>>(new Map((initial?.media ?? []).map((item) => [item.id, item])))
  const [record, setRecord] = useState<ProjectDetailData | null>(initial)

  const dirty = !sameDocument(draft, saved)
  useUnsavedChanges(dirty)
  const reports = useMemo(() => completenessOf(draft.content), [draft.content])
  const content = draft.content
  const canDelete = session.can('content:delete')
  const title = titleOf(content.title, language, t.projects.edit.newTitle)

  // The picture a choice refers to, for the thumbnails the editor shows (the ones it has been told about).
  useEffect(() => {
    const missing = [content.thumbnail?.mediaId, ...content.gallery.map((image) => image.mediaId), ...content.features.map((feature) => feature.imageMediaId)].filter((value): value is number => typeof value === 'number' && !known.has(value))
    if (missing.length === 0) return
    void endpoints.media.list().then((list) => setKnown((current) => new Map([...current, ...list.map((item) => [item.id, item] as [number, MediaItem])])))
  }, [content.thumbnail, content.gallery, content.features, known])

  const set = (path: ReadonlyArray<string | number>, value: unknown) => setDraft((current) => ({ ...current, content: setIn(current.content, path, value) }))
  const err = (field: string) => errors[field] ?? null
  const common = { language: editing, errors }

  const remember = (data: ProjectDetailData) => {
    const next = { slug: data.slug, category: data.category, content: data.content }
    setSaved(next)
    setDraft(next)
    setRecord(data)
    onSaved(data)
    setKnown((current) => new Map([...current, ...data.media.map((item) => [item.id, item] as [number, MediaItem])]))
  }

  const failure = (error: unknown) => {
    const found = fieldErrors(t, error)
    setErrors(found)
    if (error instanceof ApiError && error.status === 409) toast.error(t.projects.toast.conflict)
    else if (error instanceof ApiError && error.status === 422) toast.error(t.projects.edit.saveFailed)
    else toast.error(describeError(t, error))
  }

  const save = async (): Promise<ProjectDetailData | null> => {
    setBusy(true)
    setErrors({})
    try {
      const body = { slug: draft.slug, category: draft.category, content: draft.content, ...(record ? { expectedUpdatedAt: record.updatedAt } : {}) }
      const data = record ? await endpoints.projects.update(record.id, body) : await endpoints.projects.create(body)
      remember(data)
      toast.success(fill(record ? t.projects.toast.saved : t.projects.toast.created, { name: titleOf(data.content.title, language, data.slug) }))
      if (!record) void navigate(`/projects/${data.id}`, { replace: true })
      return data
    } catch (error) {
      failure(error)
      return null
    } finally {
      setBusy(false)
    }
  }

  const act = async (work: (id: number) => Promise<ProjectDetailData>, done: string) => {
    if (!record) return
    setBusy(true)
    try {
      remember(await work(record.id))
      toast.success(fill(done, { name: title }))
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setErrors(fieldErrors(t, error))
        setTab('publication')
        toast.error(t.projects.toast.cannotPublish)
      } else toast.error(describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  const publish = async () => {
    if (!record) return
    // What is typed is published, so what is typed is saved first, in the same breath; a failure to save stops it.
    const yes = await confirm({ title: fill(t.projects.confirm.publishTitle, { name: title }), body: t.projects.confirm.publishBody, confirmLabel: t.projects.actions.publish })
    if (!yes) return
    if (dirty && !(await save())) return
    await act(endpoints.projects.publish, t.projects.toast.published)
  }
  const unpublish = async () => {
    const yes = await confirm({ title: fill(t.projects.confirm.unpublishTitle, { name: title }), body: t.projects.confirm.unpublishBody, confirmLabel: t.projects.actions.unpublish })
    if (yes) await act(endpoints.projects.unpublish, t.projects.toast.unpublished)
  }
  const archive = async () => {
    const yes = await confirm({ title: fill(t.projects.confirm.archiveTitle, { name: title }), body: t.projects.confirm.archiveBody, confirmLabel: t.projects.actions.archive })
    if (yes) await act(endpoints.projects.archive, t.projects.toast.archived)
  }
  const duplicate = async () => {
    if (!record) return
    setBusy(true)
    try {
      const copy = await endpoints.projects.duplicate(record.id)
      toast.success(fill(t.projects.toast.duplicated, { name: title }))
      void navigate(`/projects/${copy.id}`)
    } catch (error) {
      toast.error(describeError(t, error))
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    if (!record) return
    const yes = await confirm({ title: fill(t.projects.confirm.deleteTitle, { name: title }), body: t.projects.confirm.deleteBody, danger: true })
    if (!yes) return
    setBusy(true)
    try {
      await endpoints.projects.remove(record.id)
      setSaved(draft)
      toast.success(fill(t.projects.toast.deleted, { name: title }))
      void navigate('/projects')
    } catch (error) {
      toast.error(describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  const choose = (item: MediaItem) => {
    setKnown((current) => new Map(current).set(item.id, item))
    if (picking?.kind === 'thumbnail') set(['thumbnail'], { mediaId: item.id, alt: content.thumbnail?.alt ?? emptyTri() })
    else if (picking?.kind === 'gallery') {
      if (picking.index === 'new') set(['gallery'], [...content.gallery, { mediaId: item.id, device: item.width >= item.height ? 'desktop' : 'mobile', alt: emptyTri(), caption: emptyTri(), hero: content.gallery.length === 0 }])
      else set(['gallery', picking.index, 'mediaId'], item.id)
    }
    setPicking(null)
  }

  const picture = (mediaId: number | null | undefined) => (mediaId ? known.get(mediaId) : undefined)
  const triProps = (path: string, max: number, extra: { multiline?: boolean; rows?: number } = {}) => ({
    ...common,
    path,
    max,
    ...extra,
    value: path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown>)?.[/^\d+$/.test(key) ? Number(key) : key], content) as ProjectContent['title'],
    onChange: (value: ProjectContent['title']) => set(path.split('.').map((key) => (/^\d+$/.test(key) ? Number(key) : key)), value),
  })

  const categoryOptions = categories.map((category) => ({ value: category.key, label: category.label[language] || category.label.hu }))
  const blockers = record?.blockers ?? []
  const previewHref = record ? `/${language}/work/preview/${record.id}` : null
  const state = record?.status ?? 'draft'

  return (
    <>
      <PageHeader
        title={title}
        back={{ to: '/projects', label: t.projects.edit.back }}
        lead={record ? `/work/${record.slug} · ${t.projects.status[state]}` : undefined}
        actions={
          <>
            {previewHref ? (
              <AdminButton href={previewHref} target="_blank" rel="noopener noreferrer" variant="secondary">
                {t.projects.actions.preview}
              </AdminButton>
            ) : (
              <AdminButton variant="secondary" disabled aria-describedby="preview-disabled">
                {t.projects.actions.preview}
              </AdminButton>
            )}
            <AdminButton variant="primary" onClick={() => void save()} loading={busy} loadingLabel={t.projects.edit.saving} disabled={!dirty && record !== null}>
              {record ? t.projects.edit.saveDraft : t.projects.edit.create}
            </AdminButton>
          </>
        }
      />
      <p id="preview-disabled" className={cx(styles.hint, page.saveState)} role="status">
        {dirty ? t.projects.edit.unsaved : record ? t.projects.edit.savedState : t.projects.edit.previewDisabled}
        {record && ` · ${t.projects.edit.previewHelp}`}
      </p>

      <div className={styles.stackLg}>
        <LanguageBar value={editing} onChange={setEditing} reports={reports} />
        <Tabs idBase="project" label={t.projects.title} value={tab} onChange={(next) => setTab(next as TabId)} tabs={TABS.map((id) => ({ id, label: t.projects.edit.tabs[id], attention: Object.keys(errors).some((key) => errorTab(key) === id), attentionLabel: t.projects.edit.saveFailed }))} />

        <TabPanel id="general" idBase="project" active={tab === 'general'}>
          <div className={cx(styles.stackLg, page.tabPanelGap)}>
            <DetailPanel>
              <div className={styles.formGrid}>
                <TextField label={t.projects.edit.general.slug} value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value.toLowerCase() })} hint={t.projects.edit.general.slugHint} error={err('slug')} disabled={Boolean(record?.publishedAt)} required maxLength={60} />
                <SelectField label={t.projects.edit.general.category} value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} options={categoryOptions} error={err('category')} required />
                <SelectField label={t.projects.edit.general.projectStatus} hint={t.projects.edit.general.projectStatusHelp} value={content.projectStatus} onChange={(event) => set(['projectStatus'], event.target.value)} options={opts(PROJECT_STATUSES, t.projects.edit.general.options.projectStatus)} error={err('content.projectStatus')} />
                <SwitchField label={t.projects.edit.general.detailPage} hint={t.projects.edit.general.detailPageHelp} checked={content.detailPage} onChange={(checked) => set(['detailPage'], checked)} />
              </div>
              <TriField label={t.projects.edit.general.title} required {...triProps('title', 120)} />
              <TriField label={t.projects.edit.general.cardLabel} hint={t.projects.edit.general.cardLabelHelp} optional {...triProps('cardLabel', 200)} />
              <TriField label={t.projects.edit.general.cardDescription} required {...triProps('cardDescription', 400, { multiline: true, rows: 3 })} />
              <TriField label={t.projects.edit.general.summary} hint={t.projects.edit.general.summaryHelp} required {...triProps('summary', 800, { multiline: true, rows: 3 })} />
              <TextAreaField label={t.projects.edit.general.tags} value={content.tags.join('\n')} onChange={(event) => set(['tags'], linesToList(event.target.value))} rows={4} optional error={err('content.tags')} />
            </DetailPanel>
            <DetailPanel title={t.projects.edit.general.presentation}>
              <div className={styles.formGrid}>
                <SelectField label={t.projects.edit.general.accent} value={content.accent} onChange={(event) => set(['accent'], event.target.value)} options={opts(ACCENTS, t.projects.edit.general.options.accent)} />
                <SelectField label={t.projects.edit.general.hero} value={content.hero} onChange={(event) => set(['hero'], event.target.value)} options={opts(HEROES, t.projects.edit.general.options.hero)} />
                <SelectField label={t.projects.edit.general.mockup} value={content.mockup} onChange={(event) => set(['mockup'], event.target.value)} options={opts(MOCKUPS, t.projects.edit.general.options.mockup)} />
                <SelectField label={t.projects.edit.general.layout} value={content.layout} onChange={(event) => set(['layout'], event.target.value)} options={opts(LAYOUTS, t.projects.edit.general.options.layout)} />
              </div>
            </DetailPanel>
          </div>
        </TabPanel>

        <TabPanel id="images" idBase="project" active={tab === 'images'}>
          <div className={cx(styles.stackLg, page.tabPanelGap)}>
            <DetailPanel title={t.projects.edit.images.thumbnail}>
              <p className={styles.hint}>{t.projects.edit.images.thumbnailHelp}</p>
              <PictureBox item={picture(content.thumbnail?.mediaId)} t={t} onChoose={() => setPicking({ kind: 'thumbnail' })} onRemove={content.thumbnail ? () => set(['thumbnail'], null) : undefined} />
              {content.thumbnail && <TriField label={t.projects.edit.images.thumbnailAlt} required {...triProps('thumbnail.alt', 200)} />}
            </DetailPanel>
            <DetailPanel title={t.projects.edit.images.gallery}>
              <p className={styles.hint}>{t.projects.edit.images.galleryHelp}</p>
              <ItemList
                items={content.gallery}
                onChange={(items) => set(['gallery'], items)}
                max={LIMITS.gallery}
                itemLabel={t.projects.edit.images.gallery}
                render={(image, index, update) => (
                  <>
                    <PictureBox item={picture(image.mediaId)} t={t} onChoose={() => setPicking({ kind: 'gallery', index })} />
                    <div className={styles.formGrid}>
                      <SelectField label={t.projects.edit.images.device} value={image.device} onChange={(event) => update({ ...image, device: event.target.value as 'desktop' | 'mobile' })} options={[{ value: 'desktop', label: t.projects.edit.images.desktop }, { value: 'mobile', label: t.projects.edit.images.mobile }]} />
                      <CheckField label={t.projects.edit.images.hero} checked={image.hero} onChange={(checked) => set(['gallery'], content.gallery.map((other, at) => (at === index ? { ...other, hero: checked } : checked ? { ...other, hero: false } : other)))} />
                    </div>
                    <TriField label={t.projects.edit.images.alt} hint={t.projects.edit.images.altHelp} required {...triProps(`gallery.${index}.alt`, 200)} />
                    <TriField label={t.projects.edit.images.caption} optional {...triProps(`gallery.${index}.caption`, 200)} />
                  </>
                )}
              />
              <div>
                <AdminButton variant="primary" onClick={() => setPicking({ kind: 'gallery', index: 'new' })} disabled={content.gallery.length >= LIMITS.gallery}>
                  <Icon name="plus" />
                  {t.projects.edit.images.addImage}
                </AdminButton>
              </div>
              <TriField label={t.projects.edit.images.note} hint={t.projects.edit.images.noteHelp} optional {...triProps('galleryNote', 400, { multiline: true, rows: 2 })} />
            </DetailPanel>
          </div>
        </TabPanel>

        <TabPanel id="descriptions" idBase="project" active={tab === 'descriptions'}>
          <div className={cx(styles.stackLg, page.tabPanelGap)}>
            <DetailPanel title={t.projects.edit.descriptions.overview}>
              <TriField label={t.projects.edit.descriptions.what} required {...triProps('overview.what', 3000, { multiline: true, rows: 6 })} />
              <TriField label={t.projects.edit.descriptions.audience} optional {...triProps('overview.audience', 3000, { multiline: true })} />
              <TriField label={t.projects.edit.descriptions.problem} optional {...triProps('overview.problem', 3000, { multiline: true })} />
              <TriField label={t.projects.edit.descriptions.goal} optional {...triProps('overview.goal', 3000, { multiline: true })} />
              <TriField label={t.projects.edit.descriptions.role} optional {...triProps('role', 400, { multiline: true, rows: 2 })} />
            </DetailPanel>
            <DetailPanel title={t.projects.edit.descriptions.challenges}>
              <ItemList items={content.challenges} onChange={(items) => set(['challenges'], items)} max={LIMITS.challenges} create={() => ({ title: emptyTri(), problem: emptyTri(), solution: emptyTri(), source: '' })} addLabel={t.projects.edit.descriptions.challengeTitle} itemLabel={t.projects.edit.descriptions.challengeTitle}
                render={(_, index, update) => (
                  <>
                    <TriField label={t.projects.edit.descriptions.challengeTitle} {...triProps(`challenges.${index}.title`, 200)} />
                    <TriField label={t.projects.edit.descriptions.problemText} {...triProps(`challenges.${index}.problem`, 1500, { multiline: true })} />
                    <TriField label={t.projects.edit.descriptions.solution} {...triProps(`challenges.${index}.solution`, 1500, { multiline: true })} />
                    <TextField label={t.projects.edit.descriptions.source} value={content.challenges[index].source} onChange={(event) => update({ ...content.challenges[index], source: event.target.value })} optional maxLength={160} />
                  </>
                )}
              />
            </DetailPanel>
            <DetailPanel title={t.projects.edit.descriptions.approach}>
              <ItemList items={content.approach} onChange={(items) => set(['approach'], items)} max={LIMITS.list} create={() => ({ title: emptyTri(), text: emptyTri() })} addLabel={t.projects.edit.descriptions.stepTitle} itemLabel={t.projects.edit.descriptions.stepTitle}
                render={(_, index) => (
                  <>
                    <TriField label={t.projects.edit.descriptions.stepTitle} {...triProps(`approach.${index}.title`, 200)} />
                    <TriField label={t.projects.edit.descriptions.stepText} {...triProps(`approach.${index}.text`, 1500, { multiline: true })} />
                  </>
                )}
              />
            </DetailPanel>
            <DetailPanel title={t.projects.edit.descriptions.architectureText}>
              <TriField label={t.projects.edit.descriptions.architectureText} hint={t.projects.edit.descriptions.architectureHelp} optional {...triProps('architectureText', 3000, { multiline: true, rows: 6 })} />
            </DetailPanel>
            <DetailPanel title={t.projects.edit.descriptions.features}>
              <ItemList items={content.features} onChange={(items) => set(['features'], items)} max={LIMITS.list} create={() => ({ title: emptyTri(), text: emptyTri(), status: 'done' as const, imageMediaId: null })} addLabel={t.projects.edit.descriptions.featureTitle} itemLabel={t.projects.edit.descriptions.featureTitle}
                render={(feature, index, update) => (
                  <>
                    <TriField label={t.projects.edit.descriptions.featureTitle} {...triProps(`features.${index}.title`, 200)} />
                    <TriField label={t.projects.edit.descriptions.featureText} {...triProps(`features.${index}.text`, 1500, { multiline: true })} />
                    <div className={styles.formGrid}>
                      <SelectField label={t.projects.edit.descriptions.featureStatus} value={feature.status} onChange={(event) => update({ ...feature, status: event.target.value as typeof feature.status })} options={opts(FEATURE_STATUSES, t.projects.edit.descriptions.statuses)} />
                      <SelectField label={t.projects.edit.descriptions.featureImage} value={String(feature.imageMediaId ?? '')} onChange={(event) => update({ ...feature, imageMediaId: event.target.value ? Number(event.target.value) : null })} options={[{ value: '', label: t.projects.edit.descriptions.noImage }, ...content.gallery.map((image, at) => ({ value: String(image.mediaId), label: `${t.projects.edit.images.gallery} ${at + 1}` }))]} />
                    </div>
                  </>
                )}
              />
              <h3 className={styles.sectionTitle}>{t.projects.edit.descriptions.limits}</h3>
              <TextList list={content.limits} onChange={(list) => set(['limits'], list)} path="limits" label={t.projects.edit.descriptions.item} t={t} triProps={triProps} />
            </DetailPanel>
            <DetailPanel title={t.projects.edit.descriptions.decisions}>
              <ItemList items={content.decisions} onChange={(items) => set(['decisions'], items)} max={LIMITS.list} create={() => ({ title: emptyTri(), text: emptyTri() })} addLabel={t.projects.edit.descriptions.decisionTitle} itemLabel={t.projects.edit.descriptions.decisionTitle}
                render={(_, index) => (
                  <>
                    <TriField label={t.projects.edit.descriptions.decisionTitle} {...triProps(`decisions.${index}.title`, 200)} />
                    <TriField label={t.projects.edit.descriptions.decisionText} {...triProps(`decisions.${index}.text`, 1500, { multiline: true })} />
                  </>
                )}
              />
            </DetailPanel>
            <DetailPanel title={t.projects.edit.descriptions.learned}>
              <p className={styles.hint}>{t.projects.edit.descriptions.learnedHelp}</p>
              <TextList list={content.learned} onChange={(list) => set(['learned'], list)} path="learned" label={t.projects.edit.descriptions.item} t={t} triProps={triProps} />
              <h3 className={styles.sectionTitle}>{t.projects.edit.descriptions.next}</h3>
              <TextList list={content.next} onChange={(list) => set(['next'], list)} path="next" label={t.projects.edit.descriptions.item} t={t} triProps={triProps} />
            </DetailPanel>
            <DetailPanel title={t.projects.edit.descriptions.results}>
              <p className={styles.notice}>
                <Icon name="info" />
                <span>{t.projects.edit.descriptions.resultsHelp}</span>
              </p>
              <TextList list={content.results} onChange={(list) => set(['results'], list)} path="results" label={t.projects.edit.descriptions.item} t={t} triProps={triProps} />
            </DetailPanel>
          </div>
        </TabPanel>

        <TabPanel id="technical" idBase="project" active={tab === 'technical'}>
          <div className={cx(styles.stackLg, page.tabPanelGap)}>
            <DetailPanel title={t.projects.edit.technical.stack}>
              <p className={styles.hint}>{t.projects.edit.technical.stackHelp}</p>
              {STACK_GROUPS.map((group) => {
                const row = content.stack.find((entry) => entry.group === group)
                return (
                  <TextAreaField
                    key={group}
                    label={t.projects.edit.technical.groups[group]}
                    value={(row?.items ?? []).join('\n')}
                    rows={3}
                    optional
                    onChange={(event) => {
                      const items = linesToList(event.target.value)
                      const others = content.stack.filter((entry) => entry.group !== group)
                      set(['stack'], STACK_GROUPS.flatMap((name) => (name === group ? (items.length > 0 || event.target.value !== '' ? [{ group, items }] : []) : others.filter((entry) => entry.group === name))))
                    }}
                  />
                )
              })}
              <TextField label={t.projects.edit.technical.repoName} value={content.repoName} onChange={(event) => set(['repoName'], event.target.value)} optional maxLength={120} />
            </DetailPanel>
            <DetailPanel title={t.projects.edit.technical.diagram}>
              {content.architecture ? (
                <>
                  <p className={styles.notice}>
                    <Icon name="info" />
                    <span>{t.projects.edit.technical.diagramKept}</span>
                  </p>
                  <div>
                    <AdminButton variant="secondary" danger onClick={() => set(['architecture'], null)}>
                      {t.projects.edit.technical.diagramRemove}
                    </AdminButton>
                  </div>
                </>
              ) : (
                <p className={styles.muted}>{t.projects.edit.technical.diagramNone}</p>
              )}
            </DetailPanel>
          </div>
        </TabPanel>

        <TabPanel id="sections" idBase="project" active={tab === 'sections'}>
          <div className={page.tabPanelGap}>
            <DetailPanel title={t.projects.edit.sections.title}>
              <p className={styles.hint}>{t.projects.edit.sections.help}</p>
              <div className={styles.checkGrid}>
                {SECTIONS.map((section) => (
                  <CheckField key={section} label={t.projects.edit.sections.names[section]} checked={!content.hidden.includes(section)} onChange={(shown) => set(['hidden'], shown ? content.hidden.filter((name) => name !== section) : [...content.hidden, section])} />
                ))}
              </div>
              <p className={styles.hint}>{t.projects.edit.sections.fixed}</p>
            </DetailPanel>
          </div>
        </TabPanel>

        <TabPanel id="links" idBase="project" active={tab === 'links'}>
          <div className={page.tabPanelGap}>
            <DetailPanel title={t.projects.edit.links.title}>
              <p className={styles.hint}>{t.projects.edit.links.help}</p>
              {(['demo', 'source', 'video'] as const).map((key) => (
                <LinkEditor key={key} label={t.projects.edit.links[key]} value={content.links[key]} onChange={(value) => set(['links', key], value)} error={err(`content.links.${key}.url`)} t={t} />
              ))}
              <LinkEditor label={t.projects.edit.links.extra} value={content.links.extra} onChange={(value) => set(['links', 'extra'], value ? { ...value, label: content.links.extra?.label ?? emptyTri() } : null)} error={err('content.links.extra.url')} t={t} />
              {content.links.extra && <TriField label={t.projects.edit.links.extraLabel} {...triProps('links.extra.label', 120)} />}
            </DetailPanel>
          </div>
        </TabPanel>

        <TabPanel id="publication" idBase="project" active={tab === 'publication'}>
          <div className={cx(styles.stackLg, page.tabPanelGap)}>
            <DetailPanel title={t.projects.edit.publication.title}>
              <p>
                <strong>{t.projects.edit.publication.state}: </strong>
                {t.projects.status[state]}
                {record && ` · ${record.publishedAt ? fill(t.projects.edit.publication.publishedAt, { date: new Date(record.publishedAt).toLocaleDateString(language) }) : t.projects.edit.publication.neverPublished}`}
              </p>
              <p className={styles.hint}>{t.projects.edit.publication.stateHelp}</p>
              {record && state !== 'archived' && (
                <SwitchField label={t.projects.edit.publication.featured} hint={t.projects.edit.publication.featuredHelp} checked={record.featured} onChange={(featured) => void act((projectId) => endpoints.projects.feature(projectId, featured), featured ? t.projects.toast.featured : t.projects.toast.unfeatured)} disabled={busy} />
              )}
              <h3 className={styles.sectionTitle}>{t.projects.edit.publication.blockers}</h3>
              {record === null ? (
                <p className={styles.muted}>{t.projects.edit.previewDisabled}</p>
              ) : blockers.length === 0 && Object.keys(reports).every((code) => reports[code as Language].blocking.length === 0) ? (
                <p className={styles.notice}>
                  <Icon name="checkCircle" />
                  <span>{t.projects.edit.publication.ready}</span>
                </p>
              ) : (
                <ul className={styles.stack}>
                  {LANGUAGES.flatMap((code) => reports[code].blocking.map((field) => <li key={`${code}.${field}`}>{blockerText(t, code, field)}</li>))}
                </ul>
              )}
              <div className={styles.row}>
                {record && state !== 'published' && state !== 'archived' && (
                  <AdminButton variant="primary" disabled={busy} onClick={() => void publish()}>
                    {t.projects.actions.publish}
                  </AdminButton>
                )}
                {record && state === 'published' && (
                  <>
                    <AdminButton variant="secondary" disabled={busy} onClick={() => void unpublish()}>
                      {t.projects.actions.unpublish}
                    </AdminButton>
                    {content.detailPage && (
                      <AdminButton href={`/${language}/work/${record.slug}`} target="_blank" rel="noopener noreferrer" variant="text">
                        {t.projects.edit.publication.open}
                      </AdminButton>
                    )}
                  </>
                )}
              </div>
            </DetailPanel>
            {record && (
              <DetailPanel title={t.projects.edit.publication.danger}>
                <div className={styles.row}>
                  {state !== 'archived' ? (
                    <AdminButton variant="secondary" disabled={busy} onClick={() => void archive()}>
                      <Icon name="archive" />
                      {t.projects.actions.archive}
                    </AdminButton>
                  ) : (
                    <AdminButton variant="secondary" disabled={busy} onClick={() => void act(endpoints.projects.restore, t.projects.toast.restored)}>
                      {t.projects.actions.restore}
                    </AdminButton>
                  )}
                  <AdminButton variant="secondary" disabled={busy} onClick={() => void duplicate()}>
                    {t.projects.actions.duplicate}
                  </AdminButton>
                  {canDelete && (
                    <AdminButton variant="text" danger disabled={busy} onClick={() => void remove()}>
                      <Icon name="trash" />
                      {t.projects.actions.delete}
                    </AdminButton>
                  )}
                </div>
              </DetailPanel>
            )}
          </div>
        </TabPanel>
      </div>

      <MediaPicker open={picking !== null} onClose={() => setPicking(null)} onChoose={choose} />
    </>
  )
}

/** Which tab a server field belongs to, for the mark on the tab that has a problem. */
function errorTab(field: string): TabId {
  const path = field.replace(/^content\./, '')
  if (/^(slug|category|projectStatus|detailPage|title|cardLabel|cardDescription|summary|tags|accent|hero|mockup|layout)/.test(path)) return 'general'
  if (/^(thumbnail|gallery|galleryNote)/.test(path)) return 'images'
  if (/^(stack|repoName|architecture\b)/.test(path)) return 'technical'
  if (/^hidden/.test(path)) return 'sections'
  if (/^links/.test(path)) return 'links'
  return 'descriptions'
}

function blockerText(t: ReturnType<typeof useText>, language: Language, field: string): string {
  const names = t.projects.edit.publication.field as Record<string, string>
  const key = field.startsWith('gallery.') ? 'gallery' : field
  return `${(t.languages as Record<string, string>)[language]}: ${names[key] ?? field}`
}

function PictureBox({ item, t, onChoose, onRemove }: { item: MediaItem | undefined; t: ReturnType<typeof useText>; onChoose: () => void; onRemove?: () => void }) {
  return (
    <div className={page.thumbBox}>
      {item ? <img src={item.src} width={item.width} height={item.height} alt="" className={page.thumbImage} /> : <p className={styles.muted}>{t.projects.edit.images.none}</p>}
      <div className={styles.row}>
        <AdminButton variant="secondary" onClick={onChoose}>
          {item ? t.projects.edit.images.replace : t.projects.edit.images.choose}
        </AdminButton>
        {onRemove && (
          <AdminButton variant="text" danger onClick={onRemove}>
            <Icon name="trash" />
            {t.projects.edit.images.remove}
          </AdminButton>
        )}
      </div>
    </div>
  )
}

/** A list of single texts (lessons, results, limits): one multi-line field per item. */
function TextList({ list, onChange, path, label, t, triProps }: { list: ProjectContent['limits']; onChange: (list: ProjectContent['limits']) => void; path: string; label: string; t: ReturnType<typeof useText>; triProps: (path: string, max: number, extra?: { multiline?: boolean; rows?: number }) => Parameters<typeof TriField>[0] extends infer P ? Omit<P & object, 'label'> : never }) {
  void t
  return (
    <ItemList items={list} onChange={onChange} max={LIMITS.list} create={emptyTri} addLabel={label} itemLabel={label} render={(_, index) => <TriField label={label} {...(triProps(`${path}.${index}`, 1500, { multiline: true, rows: 3 }) as Omit<Parameters<typeof TriField>[0], 'label'>)} />} />
  )
}

/** An address and the one thing that lets it be shown: the administrator opened it and it works. */
function LinkEditor({ label, value, onChange, error, t }: { label: string; value: { url: string; verified: boolean } | null; onChange: (value: { url: string; verified: boolean } | null) => void; error: string | null; t: ReturnType<typeof useText> }) {
  return (
    <div className={styles.stack}>
      <TextField label={`${label} · ${t.projects.edit.links.url}`} type="url" inputMode="url" placeholder="https://" value={value?.url ?? ''} onChange={(event) => onChange(event.target.value === '' ? null : { url: event.target.value, verified: false })} error={error} optional />
      {value && (
        <CheckField label={t.projects.edit.links.verified} hint={value.verified ? undefined : t.projects.edit.links.unverified} checked={value.verified} onChange={(verified) => onChange({ ...value, verified })} />
      )}
    </div>
  )
}
