import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useI18n } from '../i18n/useI18n'
import { useProjectList } from './store'
import { viewOf, type CardView, type ProjectCategory } from './types'

export interface Cards {
  loading: boolean
  /** Every project in the list, in the administrator's order, in the visitor's language. */
  all: readonly CardView[]
  /** What the home page's Selected work shows: the featured ones, or the first four when none is featured. */
  featured: readonly CardView[]
  categories: ReadonlyArray<{ key: string; label: string }>
  source: 'api' | 'static'
  preview: boolean
}

/** `?preview=1` on the Work page or the home page asks for the administrator's preview (drafts included; only an administrator is answered). */
export function usePreviewFlag(): boolean {
  const [params] = useSearchParams()
  return params.get('preview') === '1'
}

const label = (category: ProjectCategory, lang: 'hu' | 'en' | 'nl'): string => category.label[lang] || category.label.hu

/** The projects the pages draw, in one language. Both the Work page and the home page read this, so there is one source. */
export function useCards(): Cards {
  const { lang } = useI18n()
  const wantsPreview = usePreviewFlag()
  const state = useProjectList(wantsPreview)
  return useMemo(() => {
    const names = new Map(state.categories.map((category) => [category.key, label(category, lang)]))
    const all = state.cards.map((card) => viewOf(card, lang, names.get(card.category)))
    const featured = all.filter((card) => card.featured)
    return {
      loading: state.status === 'loading',
      all,
      featured: featured.length > 0 ? featured : all.slice(0, 4),
      categories: state.categories.map((category) => ({ key: category.key, label: label(category, lang) })),
      source: state.source,
      preview: state.preview,
    }
  }, [state, lang])
}
