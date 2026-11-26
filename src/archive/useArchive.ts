import { useMemo } from 'react'
import { useLocalized } from '../components/lab/core/useLabText'
import { archiveText } from '../content/archive/text'
import { demoEntry } from '../content/demos/entry'
import { experiments, statusLabels } from '../content/lab'
import { playgroundEntry } from '../content/playground/entry'
import { playgroundMeta } from '../content/playground/meta'
import { demoTypesFor, parseProjectDemo, type DemoType } from '../demos/ids'
import { useI18n } from '../i18n/useI18n'
import { useProjectDetails, useProjectList } from '../projects/store'
import { isAvailable, viewOf, type CardView } from '../projects/types'
import { buildEntries, categoryNames, facetsOf, publicProjects, type ArchiveEntry, type ArchiveLabels, type Facets } from './model'

export interface Archive {
  entries: readonly ArchiveEntry[]
  facets: Facets
  labels: ArchiveLabels
  /** The published projects (and their demos) are still arriving; the Lab and the tool are here already. */
  loading: boolean
  projects: readonly CardView[]
  demos: ReadonlyArray<{ slug: string; type: DemoType }>
  source: 'api' | 'static'
}

/**
 * The archive's entries in the page's language, from the PUBLIC data only. It asks the project store for the public list (never the administrator's preview: `?preview=1`
 * is deliberately ignored here), reads the public detail of the projects that can have a demo (to know which have one switched on), and adds the Lab's six experiences and the
 * design tool from their own registries. Nothing is fetched that the project pages do not already fetch.
 */
export function useArchive(): Archive {
  const { lang, t } = useI18n()
  const words = useLocalized(archiveText)
  const demoWords = useLocalized(demoEntry)
  const list = useProjectList(false)
  // A list that was loaded through an administrator's preview elsewhere in this visit is not the public one: it is not used, and the public one is being asked for.
  const publicList = list.preview ? null : list

  const categoryName = useMemo(() => categoryNames(publicList?.categories ?? [], lang), [publicList, lang])
  const cards = useMemo(
    () => publicProjects((publicList?.cards ?? []).filter((card) => isAvailable(card, lang)).map((card) => viewOf(card, lang, categoryName(card.category)))),
    [publicList, lang, categoryName],
  )

  const slugs = useMemo(() => cards.filter((card) => card.detailPath !== null && demoTypesFor(card.slug).length > 0).map((card) => card.slug), [cards])
  const details = useProjectDetails(slugs)

  const fromBackend = publicList?.source === 'api'
  const demos = useMemo(
    () =>
      slugs.flatMap((slug) => {
        const state = details.get(slug)
        if (state?.status !== 'ready') return []
        const { record, source } = state
        // A demo is listed only on the word of a public answer about this very project, which still has a page and exists in this language.
        if (record.preview || record.card.draft || record.card.slug !== slug || record.card.detailPath === null || !isAvailable(record.card, lang)) return []
        // When the backend listed the projects, the website's own copy of one (used when its detail cannot be read) must not switch on a demo the CMS may have switched off.
        if (fromBackend && source !== 'api') return []
        const demo = parseProjectDemo(record.detail.demo, slug)
        return demo ? [{ slug, type: demo.type }] : []
      }),
    [slugs, details, lang, fromBackend],
  )

  const loading = publicList === null || publicList.status === 'loading' || slugs.some((slug) => details.get(slug)?.status === 'loading')

  const entries = useMemo(
    () =>
      buildEntries({
        lang,
        projects: cards,
        demos,
        experiments,
        categoryName,
        words: {
          creativeCoding: words.categories.creativeCoding,
          designTools: words.categories.designTools,
          unnamedCategory: words.categories.unnamed,
          unnamedCategoryNumbered: words.categories.unnamedNumbered,
          demoName: (type) => demoWords.kinds[type].name,
          demoSummary: (type) => demoWords.kinds[type].summary,
          toolTitle: playgroundEntry.title[lang],
          toolDescription: playgroundMeta.description[lang],
          demoTitle: words.demoTitle,
        },
      }),
    [lang, cards, demos, categoryName, words, demoWords],
  )

  const labels = useMemo<ArchiveLabels>(
    () => ({
      kind: { project: words.kinds.one.project, demo: words.kinds.one.demo, lab: words.kinds.one.lab, tool: words.kinds.one.tool },
      status: { live: t.status.live, demo: t.status.demo, 'in-progress': t.status.inProgress, concept: t.status.concept, ready: statusLabels.ready[lang] },
    }),
    [words, t, lang],
  )

  const facets = useMemo(() => facetsOf(entries), [entries])
  return { entries, facets, labels, loading, projects: cards, demos, source: publicList?.source ?? 'api' }
}
