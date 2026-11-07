import { ApiError } from '../api/client'
import * as endpoints from '../api/endpoints'
import { AdminButton } from '../components/AdminButton'
import { SelectField } from '../components/form'
import { Icon } from '../components/Icon'
import { DetailPanel, PageHeader } from '../components/layout'
import { DocumentActions, DocumentStatus, RowButtons, TriFields } from '../components/ShopEditors'
import { ErrorState, LoadingState } from '../components/states'
import { useResource } from '../hooks/useResource'
import { useShopDocument } from '../hooks/useShopDocument'
import { fill, useInterfaceLanguage, useText } from '../i18n'
import {
  FEATURE_LEVELS,
  finalizeComparison,
  levelSummary,
  move,
  newFeature,
  removeAt,
  replaceAt,
  SHOP_LIMITS,
  type ComparisonDoc,
  type DocumentView,
  type FeatureLevel,
} from '../lib/shop'
import { useSession } from '../session/SessionProvider'
import styles from '../styles/ui.module.scss'

/**
 * The tier comparison, as the website's visitors read it: for each package a short label ("Essential foundation") and the package it
 * builds on, and the features in their order, each with a name and an explanation in the three languages and how every package
 * relates to it (included, an optional add-on, a custom service, not part of it). Which features a tier introduces, what it adds to
 * the one below and the "in every package" group are worked out from this, not typed. Saving keeps a draft; publishing is what
 * visitors see (within about a minute).
 */
export function ShopComparisonPage() {
  const session = useSession()
  const resource = useResource((signal) => endpoints.shop.get<ComparisonDoc>('comparison', signal), [])
  if (!session.can('requests:read')) return <ErrorState error={new ApiError(403, 'forbidden', '')} level={1} />
  if (resource.loading || !resource.data) return resource.error ? <ErrorState error={resource.error} onRetry={resource.reload} level={1} /> : <LoadingState />
  return <Editor initial={resource.data} canWrite={session.can('catalog:write')} />
}

function Editor({ initial, canWrite }: { initial: DocumentView<ComparisonDoc>; canWrite: boolean }) {
  const t = useText()
  const language = useInterfaceLanguage()
  const c = t.shop.comparison
  const { view, draft, setDraft, errors, busy, dirty, save, publish, unpublish } = useShopDocument<ComparisonDoc>('comparison', initial, finalizeComparison)
  const packages = draft.tiers.map((tier) => tier.package)
  // "Build — Advanced solution": the package (its name is its code, capitalised, in every language) and the label of its tier.
  const nameOf = (code: string) => {
    const name = code.charAt(0).toUpperCase() + code.slice(1)
    const label = draft.tiers.find((tier) => tier.package === code)?.label[language]
    return label ? `${name} — ${label}` : name
  }
  const levelLabel = (level: FeatureLevel) => c.levels[level]

  return (
    <>
      <PageHeader
        title={c.title}
        lead={c.lead}
        actions={canWrite ? <DocumentActions busy={busy} dirty={dirty} published={view.published !== null} onSave={() => void save()} onPublish={() => void publish()} onUnpublish={() => void unpublish()} /> : undefined}
      />
      <DocumentStatus view={view} dirty={dirty} />
      <div className={styles.stackLg}>
        <DetailPanel title={c.tiers}>
          <p className={styles.hint}>{c.tiersHelp}</p>
          {draft.tiers.map((tier, index) => (
            <div key={tier.package} className={styles.shopRow}>
              <h3 className={styles.shopRowTitle}>{tier.package}</h3>
              <TriFields label={c.label} value={tier.label} max={SHOP_LIMITS.tierLabel} required errors={errors} path={`tiers.${index}.label`} onChange={(label) => setDraft({ ...draft, tiers: replaceAt(draft.tiers, index, { ...tier, label }) })} />
              <SelectField
                label={c.buildsOn}
                hint={c.buildsOnHelp}
                value={tier.buildsOn ?? ''}
                error={errors[`tiers.${index}.buildsOn`] ?? null}
                options={[{ value: '', label: c.buildsNone }, ...draft.tiers.filter((other) => other.package !== tier.package).map((other) => ({ value: other.package, label: nameOf(other.package) }))]}
                onChange={(event) => setDraft({ ...draft, tiers: replaceAt(draft.tiers, index, { ...tier, buildsOn: event.target.value || null }) })}
              />
            </div>
          ))}
        </DetailPanel>

        <DetailPanel title={fill(c.features, { count: draft.features.length })}>
          <p className={styles.hint}>{c.featuresHelp}</p>
          {draft.features.length === 0 && <p className={styles.muted}>{c.emptyFeatures}</p>}
          {draft.features.map((feature, index) => {
            const label = feature.name[language] || feature.name.en || feature.name.hu || `#${index + 1}`
            return (
              <details key={feature.id} className={styles.shopFeature} open={Object.keys(errors).some((key) => key.startsWith(`features.${index}.`)) || undefined}>
                <summary className={styles.shopFeatureSummary}>
                  <span className={styles.shopFeatureName}>
                    {index + 1}. {label}
                  </span>
                  <span className={styles.shopFeatureLevels}>{levelSummary(feature, packages)}</span>
                </summary>
                <div className={styles.shopFeatureBody}>
                  <TriFields label={c.name} value={feature.name} max={SHOP_LIMITS.featureName} required errors={errors} path={`features.${index}.name`} onChange={(name) => setDraft({ ...draft, features: replaceAt(draft.features, index, { ...feature, name }) })} />
                  <TriFields label={c.description} hint={c.descriptionHelp} value={feature.description} max={SHOP_LIMITS.featureDescription} multiline errors={errors} path={`features.${index}.description`} onChange={(description) => setDraft({ ...draft, features: replaceAt(draft.features, index, { ...feature, description }) })} />
                  <fieldset className={styles.fieldset}>
                    <legend className={styles.legend}>{c.levelsFor}</legend>
                    <div className={styles.formGrid}>
                      {packages.map((code) => (
                        <SelectField
                          key={code}
                          label={nameOf(code)}
                          value={feature.levels[code] ?? 'none'}
                          error={errors[`features.${index}.levels.${code}`] ?? null}
                          options={FEATURE_LEVELS.map((level) => ({ value: level, label: levelLabel(level) }))}
                          onChange={(event) => setDraft({ ...draft, features: replaceAt(draft.features, index, { ...feature, levels: { ...feature.levels, [code]: event.target.value as FeatureLevel } }) })}
                        />
                      ))}
                    </div>
                  </fieldset>
                  <RowButtons index={index} count={draft.features.length} what={label} onMove={(to) => setDraft({ ...draft, features: move(draft.features, index, to) })} onRemove={() => setDraft({ ...draft, features: removeAt(draft.features, index) })} />
                </div>
              </details>
            )
          })}
          {draft.features.length < SHOP_LIMITS.features && (
            <div>
              <AdminButton variant="secondary" onClick={() => setDraft({ ...draft, features: [...draft.features, newFeature(draft.features.map((feature) => feature.id), packages)] })}>
                <Icon name="plus" />
                {c.addFeature}
              </AdminButton>
            </div>
          )}
        </DetailPanel>
      </div>
    </>
  )
}
