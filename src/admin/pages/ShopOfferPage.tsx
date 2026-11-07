import { useId, useState } from 'react'
import { ApiError } from '../api/client'
import * as endpoints from '../api/endpoints'
import { AdminButton } from '../components/AdminButton'
import { SwitchField, SelectField } from '../components/form'
import { Icon } from '../components/Icon'
import { DetailPanel, PageHeader, TabPanel, Tabs } from '../components/layout'
import { DocumentActions, DocumentStatus, RowButtons, TriFields } from '../components/ShopEditors'
import { ErrorState, LoadingState } from '../components/states'
import { useResource } from '../hooks/useResource'
import { useShopDocument } from '../hooks/useShopDocument'
import { fill, useInterfaceLanguage, useText } from '../i18n'
import {
  CORE_QUESTIONS,
  finalizeOffer,
  move,
  newId,
  newOption,
  newQuestion,
  newTitled,
  removeAt,
  replaceAt,
  SHOP_LIMITS,
  type DocumentView,
  type OfferDoc,
  type Question,
  type TitledText,
} from '../lib/shop'
import { useSession } from '../session/SessionProvider'
import styles from '../styles/ui.module.scss'

type Tab = 'copy' | 'stages' | 'components' | 'questions' | 'faq'
const TABS: readonly Tab[] = ['copy', 'stages', 'components', 'questions', 'faq']

/**
 * FULL EXPERIENCE: the flagship offer's words and its configurator. Five tabs: the copy (headline, supporting text, the two buttons,
 * the line shown on the services page, what stands where a price would), the development stages, the optional components, the
 * configurator's questions with their options (the budget ranges are the options of the budget question; it always keeps a "not sure
 * yet") and the questions visitors ask. Everything is in three languages. Saving keeps a draft; publishing makes it the public offer.
 */
export function ShopOfferPage() {
  const session = useSession()
  const resource = useResource((signal) => endpoints.shop.get<OfferDoc>('full_experience', signal), [])
  if (!session.can('requests:read')) return <ErrorState error={new ApiError(403, 'forbidden', '')} level={1} />
  if (resource.loading || !resource.data) return resource.error ? <ErrorState error={resource.error} onRetry={resource.reload} level={1} /> : <LoadingState />
  return <Editor initial={resource.data} canWrite={session.can('catalog:write')} />
}

function Editor({ initial, canWrite }: { initial: DocumentView<OfferDoc>; canWrite: boolean }) {
  const t = useText()
  const o = t.shop.offer
  const base = useId()
  const [tab, setTab] = useState<Tab>('copy')
  const { view, draft, setDraft, errors, busy, dirty, save, publish, unpublish } = useShopDocument<OfferDoc>('full_experience', initial, finalizeOffer)
  const hasErrors = (prefix: string) => Object.keys(errors).some((key) => key.startsWith(prefix))
  const attention: Record<Tab, boolean> = {
    copy: ['hero', 'teaser', 'priceLabel', 'configurator.intro'].some(hasErrors),
    stages: hasErrors('stages'),
    components: hasErrors('components'),
    questions: hasErrors('configurator.questions'),
    faq: hasErrors('faq'),
  }

  return (
    <>
      <PageHeader title={o.title} lead={o.lead} actions={canWrite ? <DocumentActions busy={busy} dirty={dirty} published={view.published !== null} onSave={() => void save()} onPublish={() => void publish()} onUnpublish={() => void unpublish()} /> : undefined} />
      <DocumentStatus view={view} dirty={dirty} />
      <Tabs label={o.tabsLabel} idBase={base} value={tab} onChange={(id) => setTab(id as Tab)} tabs={TABS.map((id) => ({ id, label: o.tabs[id], attention: attention[id], attentionLabel: t.shop.messages.needsAttention }))} />

      <TabPanel id="copy" idBase={base} active={tab === 'copy'}>
        <div className={styles.stackLg}>
          <DetailPanel title={o.copy.hero}>
            <TriFields label={o.copy.eyebrow} value={draft.hero.eyebrow} max={SHOP_LIMITS.eyebrow} required errors={errors} path="hero.eyebrow" onChange={(eyebrow) => setDraft({ ...draft, hero: { ...draft.hero, eyebrow } })} />
            <TriFields label={o.copy.headline} hint={o.copy.headlineHelp} value={draft.hero.headline} max={SHOP_LIMITS.headline} required errors={errors} path="hero.headline" onChange={(headline) => setDraft({ ...draft, hero: { ...draft.hero, headline } })} />
            <TriFields label={o.copy.supporting} value={draft.hero.supporting} max={SHOP_LIMITS.supporting} multiline required errors={errors} path="hero.supporting" onChange={(supporting) => setDraft({ ...draft, hero: { ...draft.hero, supporting } })} />
            <TriFields label={o.copy.primaryCta} value={draft.hero.primaryCta} max={SHOP_LIMITS.cta} required errors={errors} path="hero.primaryCta" onChange={(primaryCta) => setDraft({ ...draft, hero: { ...draft.hero, primaryCta } })} />
            <TriFields label={o.copy.secondaryCta} value={draft.hero.secondaryCta} max={SHOP_LIMITS.cta} required errors={errors} path="hero.secondaryCta" onChange={(secondaryCta) => setDraft({ ...draft, hero: { ...draft.hero, secondaryCta } })} />
          </DetailPanel>
          <DetailPanel title={o.copy.teaser}>
            <p className={styles.hint}>{o.copy.teaserHelp}</p>
            <TriFields label={o.copy.teaserTitle} value={draft.teaser.title} max={SHOP_LIMITS.headline} required errors={errors} path="teaser.title" onChange={(title) => setDraft({ ...draft, teaser: { ...draft.teaser, title } })} />
            <TriFields label={o.copy.teaserText} value={draft.teaser.text} max={SHOP_LIMITS.supporting} multiline required errors={errors} path="teaser.text" onChange={(text) => setDraft({ ...draft, teaser: { ...draft.teaser, text } })} />
          </DetailPanel>
          <DetailPanel title={o.copy.price}>
            <TriFields label={o.copy.priceLabel} hint={o.copy.priceHelp} value={draft.priceLabel} max={SHOP_LIMITS.cta} required errors={errors} path="priceLabel" onChange={(priceLabel) => setDraft({ ...draft, priceLabel })} />
          </DetailPanel>
          <DetailPanel title={o.copy.configurator}>
            <TriFields label={o.copy.intro} value={draft.configurator.intro} max={SHOP_LIMITS.intro} multiline errors={errors} path="configurator.intro" onChange={(intro) => setDraft({ ...draft, configurator: { ...draft.configurator, intro } })} />
          </DetailPanel>
        </div>
      </TabPanel>

      <TabPanel id="stages" idBase={base} active={tab === 'stages'}>
        <TitledList title={o.stages.title} help={o.stages.help} addLabel={o.stages.add} items={draft.stages} max={SHOP_LIMITS.stages} fallback="stage" path="stages" errors={errors} onChange={(stages) => setDraft({ ...draft, stages })} />
      </TabPanel>

      <TabPanel id="components" idBase={base} active={tab === 'components'}>
        <TitledList title={o.components.title} help={o.components.help} addLabel={o.components.add} items={draft.components} max={SHOP_LIMITS.components} fallback="component" path="components" errors={errors} onChange={(components) => setDraft({ ...draft, components })} />
      </TabPanel>

      <TabPanel id="questions" idBase={base} active={tab === 'questions'}>
        <Questions questions={draft.configurator.questions} errors={errors} onChange={(questions) => setDraft({ ...draft, configurator: { ...draft.configurator, questions } })} />
      </TabPanel>

      <TabPanel id="faq" idBase={base} active={tab === 'faq'}>
        <DetailPanel title={o.faq.title}>
          <p className={styles.hint}>{o.faq.help}</p>
          {draft.faq.map((item, index) => {
            const label = item.question.en || item.question.hu || `#${index + 1}`
            return (
              <div key={item.id} className={styles.shopRow}>
                <TriFields label={o.faq.question} value={item.question} max={SHOP_LIMITS.faqQuestion} required errors={errors} path={`faq.${index}.question`} onChange={(question) => setDraft({ ...draft, faq: replaceAt(draft.faq, index, { ...item, question }) })} />
                <TriFields label={o.faq.answer} value={item.answer} max={SHOP_LIMITS.faqAnswer} multiline required errors={errors} path={`faq.${index}.answer`} onChange={(answer) => setDraft({ ...draft, faq: replaceAt(draft.faq, index, { ...item, answer }) })} />
                <RowButtons index={index} count={draft.faq.length} what={label} onMove={(to) => setDraft({ ...draft, faq: move(draft.faq, index, to) })} onRemove={() => setDraft({ ...draft, faq: removeAt(draft.faq, index) })} />
              </div>
            )
          })}
          {draft.faq.length < SHOP_LIMITS.faq && (
            <div>
              <AdminButton variant="secondary" onClick={() => setDraft({ ...draft, faq: [...draft.faq, { id: newId('', draft.faq.map((entry) => entry.id), 'new-faq'), question: { hu: '', en: '', nl: '' }, answer: { hu: '', en: '', nl: '' } }] })}>
                <Icon name="plus" />
                {o.faq.add}
              </AdminButton>
            </div>
          )}
        </DetailPanel>
      </TabPanel>
    </>
  )
}

/** A list of things with a title and a sentence in three languages (the stages, the components), reorderable. */
function TitledList({ title, help, addLabel, items, max, fallback, path, errors, onChange }: { title: string; help: string; addLabel: string; items: TitledText[]; max: number; fallback: string; path: string; errors: Record<string, string>; onChange: (items: TitledText[]) => void }) {
  const t = useText()
  const language = useInterfaceLanguage()
  return (
    <DetailPanel title={fill(title, { count: items.length })}>
      <p className={styles.hint}>{help}</p>
      {items.map((item, index) => {
        const label = item.title[language] || item.title.en || item.title.hu || `#${index + 1}`
        return (
          <div key={item.id} className={styles.shopRow}>
            <TriFields label={t.shop.offer.itemTitle} value={item.title} max={SHOP_LIMITS.stageTitle} required errors={errors} path={`${path}.${index}.title`} onChange={(next) => onChange(replaceAt(items, index, { ...item, title: next }))} />
            <TriFields label={t.shop.offer.itemText} value={item.text} max={SHOP_LIMITS.stageText} multiline errors={errors} path={`${path}.${index}.text`} onChange={(next) => onChange(replaceAt(items, index, { ...item, text: next }))} />
            <RowButtons index={index} count={items.length} what={label} onMove={(to) => onChange(move(items, index, to))} onRemove={() => onChange(removeAt(items, index))} />
          </div>
        )
      })}
      {items.length < max && (
        <div>
          <AdminButton variant="secondary" onClick={() => onChange([...items, newTitled(items.map((item) => item.id), fallback)])}>
            <Icon name="plus" />
            {addLabel}
          </AdminButton>
        </div>
      )}
    </DetailPanel>
  )
}

function Questions({ questions, errors, onChange }: { questions: Question[]; errors: Record<string, string>; onChange: (questions: Question[]) => void }) {
  const t = useText()
  const language = useInterfaceLanguage()
  const q = t.shop.offer.questions
  const isCore = (id: string) => (CORE_QUESTIONS as readonly string[]).includes(id)
  return (
    <div className={styles.stackLg}>
      <p className={styles.hint}>{q.help}</p>
      {questions.map((question, index) => {
        const label = question.title[language] || question.title.en || question.title.hu || `#${index + 1}`
        const at = `configurator.questions.${index}`
        const change = (patch: Partial<Question>) => onChange(replaceAt(questions, index, { ...question, ...patch }))
        return (
          <DetailPanel key={question.id} title={`${index + 1}. ${label}`}>
            <TriFields label={q.title} value={question.title} max={SHOP_LIMITS.question} required errors={errors} path={`${at}.title`} onChange={(title) => change({ title })} />
            <TriFields label={q.helpText} value={question.help} max={SHOP_LIMITS.help} errors={errors} path={`${at}.help`} onChange={(help) => change({ help })} />
            <div className={styles.formGrid}>
              <SelectField
                label={q.kind}
                value={question.kind}
                hint={isCore(question.id) ? q.kindLocked : undefined}
                disabled={isCore(question.id)}
                error={errors[`${at}.kind`] ?? null}
                options={[{ value: 'single', label: q.single }, { value: 'multi', label: q.multi }]}
                onChange={(event) => change({ kind: event.target.value as Question['kind'] })}
              />
              <SwitchField label={q.required} hint={q.requiredHelp} checked={question.required} onChange={(required) => change({ required })} />
            </div>

            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>{fill(q.options, { count: question.options.length })}</legend>
              {question.id === 'budget' && <p className={styles.hint}>{q.budgetHelp}</p>}
              {errors[`${at}.options`] && (
                <p className={styles.error} role="alert">
                  {errors[`${at}.options`]}
                </p>
              )}
              {question.options.map((option, position) => {
                const optionLabel = option.label[language] || option.label.en || option.label.hu || `#${position + 1}`
                const where = `${at}.options.${position}`
                const changeOption = (patch: Partial<Question['options'][number]>) => change({ options: replaceAt(question.options, position, { ...option, ...patch }) })
                return (
                  <div key={option.id} className={styles.shopRow}>
                    <TriFields label={q.optionLabel} value={option.label} max={SHOP_LIMITS.optionLabel} required errors={errors} path={`${where}.label`} onChange={(next) => changeOption({ label: next })} />
                    <TriFields label={q.optionHint} value={option.hint} max={SHOP_LIMITS.optionHint} errors={errors} path={`${where}.hint`} onChange={(next) => changeOption({ hint: next })} />
                    <SwitchField label={q.unsure} hint={q.unsureHelp} checked={option.unsure} onChange={(unsure) => changeOption({ unsure })} />
                    <RowButtons index={position} count={question.options.length} what={optionLabel} onMove={(to) => change({ options: move(question.options, position, to) })} onRemove={() => change({ options: removeAt(question.options, position) })} />
                  </div>
                )
              })}
              {question.options.length < SHOP_LIMITS.optionsPerQuestion && (
                <div>
                  <AdminButton variant="secondary" onClick={() => change({ options: [...question.options, newOption(question.options.map((option) => option.id))] })}>
                    <Icon name="plus" />
                    {q.addOption}
                  </AdminButton>
                </div>
              )}
            </fieldset>
            <RowButtons index={index} count={questions.length} what={label} canRemove={!isCore(question.id)} onMove={(to) => onChange(move(questions, index, to))} onRemove={() => onChange(removeAt(questions, index))} />
          </DetailPanel>
        )
      })}
      {questions.length < SHOP_LIMITS.questions && (
        <div>
          <AdminButton variant="secondary" onClick={() => onChange([...questions, newQuestion(questions.map((question) => question.id))])}>
            <Icon name="plus" />
            {q.add}
          </AdminButton>
        </div>
      )}
    </div>
  )
}
