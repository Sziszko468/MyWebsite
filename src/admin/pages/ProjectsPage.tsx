import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import * as endpoints from '../api/endpoints'
import { ApiError } from '../api/client'
import type { ProjectListItem, ProjectState } from '../api/projectTypes'
import { AdminButton } from '../components/AdminButton'
import { useConfirm } from '../components/Confirm'
import { FilterDropdown } from '../components/form'
import { Icon } from '../components/Icon'
import { PageHeader, useLanguageName } from '../components/layout'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { fill, useInterfaceLanguage, useText } from '../i18n'
import { describeError } from '../lib/errors'
import { titleOf } from '../lib/projects'
import { useSession } from '../session/SessionProvider'
import { LANGUAGES } from '../../i18n/config'
import { cx } from '../../utils/cx'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'

const TONES: Record<ProjectState, string> = { draft: styles.toneWarning, published: styles.toneSuccess, archived: styles.toneNeutral }

/**
 * The portfolio's projects: what is public, what is a draft, what is archived, in the order the website lists them. Each row has
 * its quick actions (feature, move, publish, unpublish, archive, duplicate, delete); the editor has the rest. Every change is made
 * on the server and the list is read again, so what is shown is what is stored.
 */
export function ProjectsPage() {
  const t = useText()
  const language = useInterfaceLanguage()
  const name = useLanguageName()
  const toast = useToast()
  const confirm = useConfirm()
  const session = useSession()
  const [filter, setFilter] = useState<'all' | ProjectState>('all')
  const [busy, setBusy] = useState(false)
  const list = useResource((signal) => endpoints.projects.list(signal), [])
  const canWrite = session.can('content:write')
  const canDelete = session.can('content:delete')

  const all = useMemo(() => list.data?.projects ?? [], [list.data])
  const visible = useMemo(() => (filter === 'all' ? all : all.filter((project) => project.status === filter)), [all, filter])

  const run = async (work: () => Promise<unknown>, done: string, conflict?: string) => {
    setBusy(true)
    try {
      await work()
      list.reload()
      toast.success(done)
    } catch (error) {
      toast.error(error instanceof ApiError && error.status === 422 ? t.projects.toast.cannotPublish : error instanceof ApiError && error.status === 409 && conflict ? conflict : describeError(t, error))
    } finally {
      setBusy(false)
    }
  }
  const nameOf = (project: ProjectListItem) => titleOf(project.title, language, project.slug)

  const publish = async (project: ProjectListItem) => {
    const yes = await confirm({ title: fill(t.projects.confirm.publishTitle, { name: nameOf(project) }), body: t.projects.confirm.publishBody, confirmLabel: t.projects.actions.publish })
    if (yes) await run(() => endpoints.projects.publish(project.id), fill(t.projects.toast.published, { name: nameOf(project) }))
  }
  const unpublish = async (project: ProjectListItem) => {
    const yes = await confirm({ title: fill(t.projects.confirm.unpublishTitle, { name: nameOf(project) }), body: t.projects.confirm.unpublishBody, confirmLabel: t.projects.actions.unpublish })
    if (yes) await run(() => endpoints.projects.unpublish(project.id), fill(t.projects.toast.unpublished, { name: nameOf(project) }))
  }
  const archive = async (project: ProjectListItem) => {
    const yes = await confirm({ title: fill(t.projects.confirm.archiveTitle, { name: nameOf(project) }), body: t.projects.confirm.archiveBody, confirmLabel: t.projects.actions.archive })
    if (yes) await run(() => endpoints.projects.archive(project.id), fill(t.projects.toast.archived, { name: nameOf(project) }))
  }
  const remove = async (project: ProjectListItem) => {
    const yes = await confirm({ title: fill(t.projects.confirm.deleteTitle, { name: nameOf(project) }), body: t.projects.confirm.deleteBody, danger: true })
    if (yes) await run(() => endpoints.projects.remove(project.id), fill(t.projects.toast.deleted, { name: nameOf(project) }))
  }
  const move = (project: ProjectListItem, direction: -1 | 1) => {
    const ids = all.map((item) => item.id)
    const at = ids.indexOf(project.id)
    const to = at + direction
    if (to < 0 || to >= ids.length) return
    ;[ids[at], ids[to]] = [ids[to], ids[at]]
    void run(() => endpoints.projects.reorder(ids), t.projects.toast.reordered)
  }

  return (
    <>
      <PageHeader
        title={t.projects.title}
        lead={t.projects.lead}
        actions={
          canWrite ? (
            <>
              <AdminButton to="/projects/settings" variant="secondary">
                {t.projects.settings}
              </AdminButton>
              <AdminButton to="/projects/new" variant="primary">
                <Icon name="plus" />
                {t.projects.new}
              </AdminButton>
            </>
          ) : undefined
        }
      />
      <div className={styles.stackLg}>
        {all.length > 0 && (
          <FilterDropdown
            label={t.projects.filter.label}
            value={filter}
            onChange={(value) => setFilter(value as typeof filter)}
            options={[{ value: 'all', label: t.projects.filter.all }, ...(['draft', 'published', 'archived'] as const).map((state) => ({ value: state, label: t.projects.status[state] }))]}
          />
        )}
        {list.loading ? (
          <LoadingState />
        ) : list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : all.length === 0 ? (
          <EmptyState icon="layers" title={t.projects.emptyTitle} action={canWrite ? <AdminButton to="/projects/new" variant="primary">{t.projects.new}</AdminButton> : undefined}>
            {t.projects.emptyBody}
          </EmptyState>
        ) : (
          <ul className={page.projectList} aria-busy={busy || list.refreshing}>
            {visible.map((project) => {
              const title = nameOf(project)
              const first = all[0]?.id === project.id
              const last = all[all.length - 1]?.id === project.id
              const reorderable = filter === 'all' && canWrite
              return (
                <li key={project.id} className={cx(styles.card, page.projectRow)}>
                  <div className={page.projectThumb} aria-hidden="true">
                    {project.thumbnail ? <img src={project.thumbnail.src} width={project.thumbnail.width} height={project.thumbnail.height} alt="" loading="lazy" /> : <Icon name="layers" />}
                  </div>
                  <div className={page.projectMain}>
                    <h2 className={cx(styles.cardTitleTight, page.projectTitle)}>
                      <Link className={styles.cellLink} to={`/projects/${project.id}`}>
                        {title}
                      </Link>
                    </h2>
                    <p className={cx(styles.small, styles.muted)}>
                      /work/{project.slug} · {fill(t.projects.updated, { date: new Date(project.updatedAt).toLocaleDateString(language) })}
                    </p>
                    <div className={styles.rowTight}>
                      <span className={cx(styles.badge, TONES[project.status])}>
                        <span className={styles.badgeDot} aria-hidden="true" />
                        {t.projects.status[project.status]}
                      </span>
                      {project.featured && <span className={cx(styles.badge, styles.toneAccent)}>{t.projects.featured}</span>}
                      {!project.detailPage && <span className={cx(styles.badge, styles.toneNeutral)}>{t.projects.noPage}</span>}
                      {LANGUAGES.map((code) => (
                        <span key={code} className={cx(styles.badge, project.languages[code].state === 'complete' ? styles.toneSuccess : project.languages[code].state === 'incomplete' ? styles.toneWarning : styles.toneNeutral)}>
                          {fill(t.projects.languageMark, { language: name(code), state: t.projects.languageState[project.languages[code].state] })}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className={page.projectActions}>
                    {canWrite && (
                      <>
                        <AdminButton to={`/projects/${project.id}`} variant="secondary">
                          {t.projects.actions.edit}
                        </AdminButton>
                        <AdminButton href={`/${language}/work/preview/${project.id}`} target="_blank" rel="noopener noreferrer" variant="secondary">
                          {t.projects.actions.preview}
                          <span className={styles.srOnly}> {t.projects.title}</span>
                        </AdminButton>
                        {project.status !== 'archived' && (
                          <AdminButton variant="text" disabled={busy} aria-pressed={project.featured} onClick={() => void run(() => endpoints.projects.feature(project.id, !project.featured), fill(project.featured ? t.projects.toast.unfeatured : t.projects.toast.featured, { name: title }))}>
                            {fill(project.featured ? t.projects.actions.unfeature : t.projects.actions.feature, { name: title })}
                          </AdminButton>
                        )}
                        {project.status === 'draft' && (
                          <AdminButton variant="primary" disabled={busy} onClick={() => void publish(project)}>
                            {t.projects.actions.publish}
                          </AdminButton>
                        )}
                        {project.status === 'published' && (
                          <AdminButton variant="secondary" disabled={busy} onClick={() => void unpublish(project)}>
                            {t.projects.actions.unpublish}
                          </AdminButton>
                        )}
                        {project.status !== 'archived' ? (
                          <AdminButton variant="text" disabled={busy} onClick={() => void archive(project)}>
                            <Icon name="archive" />
                            {t.projects.actions.archive}
                          </AdminButton>
                        ) : (
                          <AdminButton variant="text" disabled={busy} onClick={() => void run(() => endpoints.projects.restore(project.id), fill(t.projects.toast.restored, { name: title }))}>
                            {t.projects.actions.restore}
                          </AdminButton>
                        )}
                        <AdminButton variant="text" disabled={busy} onClick={() => void run(() => endpoints.projects.duplicate(project.id), fill(t.projects.toast.duplicated, { name: title }))}>
                          {t.projects.actions.duplicate}
                        </AdminButton>
                      </>
                    )}
                    {canDelete && (
                      <AdminButton variant="text" danger disabled={busy} onClick={() => void remove(project)}>
                        <Icon name="trash" />
                        {t.projects.actions.delete}
                      </AdminButton>
                    )}
                    {reorderable && (
                      <span className={styles.rowTight}>
                        <AdminButton variant="text" disabled={busy || first} onClick={() => move(project, -1)} aria-label={fill(t.projects.actions.moveUp, { name: title })}>
                          <Icon name="up" />
                        </AdminButton>
                        <AdminButton variant="text" disabled={busy || last} onClick={() => move(project, 1)} aria-label={fill(t.projects.actions.moveDown, { name: title })}>
                          <Icon name="down" />
                        </AdminButton>
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )
}
