import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { ContactHero } from '../components/contact/ContactHero'
import { ContactSection } from '../components/contact/ContactSection'
import {
  EMPTY_CONTACT,
  PATH_KIND,
  isContactPath,
  type ContactDraft,
  type ContactField,
  type ContactKind,
  type ContactPath,
} from '../contact/types'
import { useDraft } from '../forms/useDraft'
import type { Dictionary } from '../i18n/locales/hu'
import { useI18n } from '../i18n/useI18n'

type Subjects = Dictionary['contactPage']['form']['subjects']

/** The subject a topic starts with. "Something else" has none: it has no topic to suggest. */
const subjectFor = (subjects: Subjects, kind: ContactKind): string => (kind === 'other' ? '' : subjects[kind])

/** The door named in the address (`?for=clients`), if it is one of ours. */
function pathFromSearch(search: string): ContactPath | null {
  const wanted = new URLSearchParams(search).get('for')
  return isContactPath(wanted) ? wanted : null
}

/**
 * The contact page: a hero with two doors (employers, clients), then one form that both lead to.
 * A door, or `?for=employers|clients` in the address, starts the form on its topic and with a
 * subject to begin from; the visitor may change either. A subject that the visitor has not touched
 * follows the topic (and the language), one they have written is never overwritten.
 */
export function ContactPage() {
  const { t } = useI18n()
  const { search } = useLocation()
  const subjects = t.contactPage.form.subjects

  const [initial] = useState<Partial<ContactDraft>>(() => {
    const path = pathFromSearch(search)
    return path ? { kind: PATH_KIND[path], subject: subjectFor(subjects, PATH_KIND[path]) } : {}
  })
  const { draft, set, reset } = useDraft(EMPTY_CONTACT, initial)

  // The subject the page wrote itself, to tell it from one the visitor wrote.
  const written = useRef(initial.subject ?? '')

  const chooseKind = (kind: ContactKind) => {
    set('kind', kind)
    if (!draft.subject.trim() || draft.subject === written.current) {
      written.current = subjectFor(subjects, kind)
      set('subject', subjectFor(subjects, kind))
    }
  }

  // A language switch translates a subject the page wrote and the visitor has not touched.
  useEffect(() => {
    if (!draft.kind || draft.subject !== written.current) return
    const next = subjectFor(subjects, draft.kind)
    if (next !== draft.subject) {
      written.current = next
      set('subject', next)
    }
  }, [subjects, draft.kind, draft.subject, set])

  const change = <K extends ContactField>(field: K, value: ContactDraft[K]) => {
    if (field === 'kind') chooseKind(value as ContactKind)
    else set(field, value)
  }

  const onReset = () => {
    written.current = ''
    reset()
  }

  return (
    <>
      <ContactHero onChoose={(path) => chooseKind(PATH_KIND[path])} />
      <ContactSection draft={draft} onChange={change} onReset={onReset} />
    </>
  )
}
