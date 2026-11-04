import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import * as endpoints from '../api/endpoints'
import { ApiError } from '../api/client'
import type { ExtraRecord, Need, PackageRecord, ServiceRecord } from '../api/types'
import { AdminButton } from '../components/AdminButton'
import { PriceEditor, TextsEditor } from '../components/CatalogForm'
import { CheckField, Fieldset, SwitchField, TextField } from '../components/form'
import { DetailPanel, PageHeader } from '../components/layout'
import { ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { useText } from '../i18n'
import { describeError } from '../lib/errors'
import { EXTRA_FIELDS, NEEDS, PACKAGE_FIELDS, SERVICE_FIELDS, fromForm, priceBody, priceToForm, toForm, type PriceForm, type TextValues } from '../lib/catalog'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'
import type { Language } from '../../i18n/config'

/**
 * The editors for a service, a package and an add-on. One screen each, one save: the whole record goes to the server, which
 * checks all of it (a rejected save changes nothing) and names every field that needs attention; those names come back to
 * the fields they belong to. Nothing is invented: a price is only published when it is complete, and everything else is
 * what was typed here.
 */

function useSaver(backTo: string) {
  const t = useText()
  const toast = useToast()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = async (work: () => Promise<unknown>, created: boolean, duplicateField?: string) => {
    setBusy(true)
    setErrors({})
    try {
      await work()
      toast.success(created ? t.services.edit.created : t.services.edit.saved)
      void navigate(backTo)
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setErrors(error.fields)
        toast.error(t.services.edit.fixErrors)
      } else if (error instanceof ApiError && error.status === 409 && duplicateField) {
        setErrors({ [duplicateField]: 'duplicate' })
        toast.error(t.states.conflict)
      } else {
        toast.error(describeError(t, error))
      }
      setBusy(false)
    }
  }
  return { busy, errors, setErrors, save }
}

const message = (t: ReturnType<typeof useText>, code: string | undefined): string | null => (code ? ((t.services.errors as Record<string, string>)[code] ?? code) : null)

function Footer({ busy, label, back }: { busy: boolean; label: string; back: string }) {
  const t = useText()
  return (
    <div className={styles.formActions}>
      <AdminButton type="submit" variant="primary" loading={busy} loadingLabel={t.common.saving}>
        {label}
      </AdminButton>
      <AdminButton to={back} variant="text">
        {t.common.cancel}
      </AdminButton>
    </div>
  )
}

// ---- services -----------------------------------------------------------------------------------------------------

export function ServiceEditPage() {
  const { slug } = useParams()
  const creating = slug === undefined
  const service = useResource((signal) => (creating ? Promise.resolve(null) : endpoints.catalog.service(slug, signal).then((answer) => answer.data)), [slug])
  const packages = useResource(() => endpoints.catalog.packages().then((answer) => answer.data), [])
  const all = useResource(() => (creating ? endpoints.catalog.services().then((answer) => answer.data) : Promise.resolve([] as ServiceRecord[])), [creating])
  const loading = (creating ? false : service.loading) || packages.loading || all.loading
  const error = service.error ?? packages.error ?? all.error
  if (loading) return <LoadingState />
  if (error || !packages.data) return <ErrorState level={1} error={error} onRetry={() => { service.reload(); packages.reload(); all.reload() }} />
  return <ServiceForm key={slug ?? 'new'} record={creating ? null : service.data} packages={packages.data} position={all.data?.length ?? 0} />
}

function ServiceForm({ record, packages, position }: { record: ServiceRecord | null; packages: PackageRecord[]; position: number }) {
  const t = useText()
  const e = t.services.edit
  const back = '/services?tab=services'
  const { busy, errors, save } = useSaver(back)
  const [slug, setSlug] = useState(record?.slug ?? '')
  const [category, setCategory] = useState(record?.category ?? '')
  const [active, setActive] = useState((record?.status ?? 'active') === 'active')
  const [offered, setOffered] = useState<string[]>(record?.packages ?? [])
  const [texts, setTexts] = useState<TextValues>(() => toForm(SERVICE_FIELDS, record?.translations ?? {}))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const body = { category: category.trim(), status: active ? 'active' : 'disabled', position: record?.position ?? position, packages: offered, translations: fromForm(SERVICE_FIELDS, texts) }
    void save(() => (record ? endpoints.catalog.updateService(record.slug, body) : endpoints.catalog.createService({ slug: slug.trim(), ...body })), record === null, 'slug')
  }

  return (
    <>
      <PageHeader title={record ? (record.translations.hu?.title ?? record.slug) : e.newService} back={{ to: back, label: e.backServices }} />
      <form className={page.editor} onSubmit={submit} noValidate>
        <DetailPanel title={e.identity}>
          <div className={styles.formGrid}>
            {record === null ? <TextField label={e.slug} hint={e.slugHelp} value={slug} onChange={(event) => setSlug(event.target.value)} error={message(t, errors.slug)} required autoCapitalize="none" spellCheck={false} /> : <TextField label={e.slug} value={record.slug} readOnly />}
            <TextField label={e.category} hint={e.categoryHelp} value={category} onChange={(event) => setCategory(event.target.value)} error={message(t, errors.category)} required autoCapitalize="none" spellCheck={false} />
            <div className={styles.span2}>
              <SwitchField label={active ? t.common.active : t.common.disabled} checked={active} onChange={setActive} hint={e.statusHelp} />
            </div>
          </div>
        </DetailPanel>
        <DetailPanel title={e.associations}>
          <Fieldset legend={e.packages}>
            {packages.length === 0 ? (
              <p className={styles.muted}>{e.noPackages}</p>
            ) : (
              <div className={styles.checkGrid}>
                {packages.map((pack) => (
                  <CheckField key={pack.code} label={pack.translations.hu?.name ?? pack.code} checked={offered.includes(pack.code)} onChange={(on) => setOffered(on ? [...offered, pack.code] : offered.filter((code) => code !== pack.code))} />
                ))}
              </div>
            )}
            {errors.packages && <p className={styles.error}>{message(t, errors.packages)}</p>}
          </Fieldset>
        </DetailPanel>
        <DetailPanel title={e.texts}>
          <p className={styles.hint}>{e.textsHelp}</p>
          <TextsEditor fields={SERVICE_FIELDS} values={texts} errors={errors} idBase="service-texts" onChange={(language: Language, name, value) => setTexts({ ...texts, [language]: { ...texts[language], [name]: value } })} />
        </DetailPanel>
        <Footer busy={busy} label={record ? e.save : e.create} back={back} />
      </form>
    </>
  )
}

// ---- packages -----------------------------------------------------------------------------------------------------

export function PackageEditPage() {
  const { code } = useParams()
  const creating = code === undefined
  const pack = useResource((signal) => (creating ? Promise.resolve(null) : endpoints.catalog.pack(code, signal).then((answer) => answer.data)), [code])
  const extras = useResource(() => endpoints.catalog.extras().then((answer) => answer.data), [])
  const all = useResource(() => (creating ? endpoints.catalog.packages().then((answer) => answer.data) : Promise.resolve([] as PackageRecord[])), [creating])
  const loading = (creating ? false : pack.loading) || extras.loading || all.loading
  const error = pack.error ?? extras.error ?? all.error
  if (loading) return <LoadingState />
  if (error || !extras.data) return <ErrorState level={1} error={error} onRetry={() => { pack.reload(); extras.reload(); all.reload() }} />
  return <PackageForm key={code ?? 'new'} record={creating ? null : pack.data} extras={extras.data} position={all.data?.length ?? 0} />
}

function PackageForm({ record, extras, position }: { record: PackageRecord | null; extras: ExtraRecord[]; position: number }) {
  const t = useText()
  const e = t.services.edit
  const back = '/services?tab=packages'
  const { busy, errors, setErrors, save } = useSaver(back)
  const [code, setCode] = useState(record?.code ?? '')
  const [active, setActive] = useState((record?.status ?? 'active') === 'active')
  const [featured, setFeatured] = useState(record?.featured ?? false)
  const [quoteRequired, setQuoteRequired] = useState(record?.quoteRequired ?? true)
  const [price, setPrice] = useState<PriceForm>(() => priceToForm(record?.price ?? { kind: 'quote' }, record?.vat ?? 'unspecified'))
  const [needs, setNeeds] = useState<Need[]>(record?.needs ?? [])
  const [chosen, setChosen] = useState<string[]>(record?.extras ?? [])
  const [texts, setTexts] = useState<TextValues>(() => toForm(PACKAGE_FIELDS, record?.translations ?? {}))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const priced = priceBody(price)
    if ('errors' in priced) {
      setErrors(priced.errors)
      return
    }
    const body = { status: active ? 'active' : 'disabled', featured, position: record?.position ?? position, quoteRequired, ...priced.body, needs, extras: chosen, translations: fromForm(PACKAGE_FIELDS, texts) }
    void save(() => (record ? endpoints.catalog.updatePackage(record.code, body) : endpoints.catalog.createPackage({ code: code.trim(), ...body })), record === null, 'code')
  }

  return (
    <>
      <PageHeader title={record ? (record.translations.hu?.name ?? record.code) : e.newPackage} back={{ to: back, label: e.backPackages }} />
      <form className={page.editor} onSubmit={submit} noValidate>
        <DetailPanel title={e.identity}>
          <div className={styles.stack}>
            {record === null ? <TextField label={e.code} hint={e.codeHelp} value={code} onChange={(event) => setCode(event.target.value)} error={message(t, errors.code)} required autoCapitalize="none" spellCheck={false} /> : <TextField label={e.code} value={record.code} readOnly />}
            <SwitchField label={active ? t.common.active : t.common.disabled} checked={active} onChange={setActive} hint={e.statusHelp} />
            <CheckField label={e.featured} hint={e.featuredHelp} checked={featured} onChange={setFeatured} />
            <CheckField label={e.quoteRequired} checked={quoteRequired} onChange={setQuoteRequired} />
          </div>
        </DetailPanel>
        <DetailPanel title={e.pricing}>
          <PriceEditor value={price} onChange={setPrice} errors={errors} />
        </DetailPanel>
        <DetailPanel title={e.associations}>
          <div className={styles.stackLg}>
            <Fieldset legend={e.needs}>
              <div className={styles.checkGrid}>
                {NEEDS.map((need) => (
                  <CheckField key={need} label={(t.needs as Record<string, string>)[need]} checked={needs.includes(need)} onChange={(on) => setNeeds(on ? [...needs, need] : needs.filter((item) => item !== need))} />
                ))}
              </div>
              {errors.needs && <p className={styles.error}>{message(t, errors.needs)}</p>}
            </Fieldset>
            <Fieldset legend={e.extras}>
              {extras.length === 0 ? (
                <p className={styles.muted}>{e.noExtras}</p>
              ) : (
                <div className={styles.checkGrid}>
                  {extras.map((extra) => (
                    <CheckField key={extra.code} label={extra.translations.hu?.name ?? extra.code} checked={chosen.includes(extra.code)} onChange={(on) => setChosen(on ? [...chosen, extra.code] : chosen.filter((item) => item !== extra.code))} />
                  ))}
                </div>
              )}
              {errors.extras && <p className={styles.error}>{message(t, errors.extras)}</p>}
            </Fieldset>
          </div>
        </DetailPanel>
        <DetailPanel title={e.texts}>
          <p className={styles.hint}>{e.textsHelp}</p>
          <TextsEditor fields={PACKAGE_FIELDS} values={texts} errors={errors} idBase="package-texts" onChange={(language: Language, name, value) => setTexts({ ...texts, [language]: { ...texts[language], [name]: value } })} />
        </DetailPanel>
        <Footer busy={busy} label={record ? e.save : e.create} back={back} />
      </form>
    </>
  )
}

// ---- add-ons ------------------------------------------------------------------------------------------------------

export function ExtraEditPage() {
  const { code } = useParams()
  const creating = code === undefined
  const extra = useResource((signal) => (creating ? Promise.resolve(null) : endpoints.catalog.extra(code, signal).then((answer) => answer.data)), [code])
  const all = useResource(() => (creating ? endpoints.catalog.extras().then((answer) => answer.data) : Promise.resolve([] as ExtraRecord[])), [creating])
  const loading = (creating ? false : extra.loading) || all.loading
  const error = extra.error ?? all.error
  if (loading) return <LoadingState />
  if (error) return <ErrorState level={1} error={error} onRetry={() => { extra.reload(); all.reload() }} />
  return <ExtraForm key={code ?? 'new'} record={creating ? null : extra.data} position={all.data?.length ?? 0} />
}

function ExtraForm({ record, position }: { record: ExtraRecord | null; position: number }) {
  const t = useText()
  const e = t.services.edit
  const back = '/services?tab=extras'
  const { busy, errors, setErrors, save } = useSaver(back)
  const [code, setCode] = useState(record?.code ?? '')
  const [active, setActive] = useState((record?.status ?? 'active') === 'active')
  const [price, setPrice] = useState<PriceForm>(() => priceToForm(record?.price ?? { kind: 'quote' }, record?.vat ?? 'unspecified'))
  const [appliesTo, setAppliesTo] = useState<Need[]>(record?.appliesTo ?? [])
  const [texts, setTexts] = useState<TextValues>(() => toForm(EXTRA_FIELDS, record?.translations ?? {}))

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const priced = priceBody(price)
    if ('errors' in priced) {
      setErrors(priced.errors)
      return
    }
    const body = { status: active ? 'active' : 'disabled', position: record?.position ?? position, ...priced.body, appliesTo, translations: fromForm(EXTRA_FIELDS, texts) }
    void save(() => (record ? endpoints.catalog.updateExtra(record.code, body) : endpoints.catalog.createExtra({ code: code.trim(), ...body })), record === null, 'code')
  }

  return (
    <>
      <PageHeader title={record ? (record.translations.hu?.name ?? record.code) : e.newExtra} back={{ to: back, label: e.backExtras }} />
      <form className={page.editor} onSubmit={submit} noValidate>
        <DetailPanel title={e.identity}>
          <div className={styles.stack}>
            {record === null ? <TextField label={e.code} hint={e.codeHelp} value={code} onChange={(event) => setCode(event.target.value)} error={message(t, errors.code)} required autoCapitalize="none" spellCheck={false} /> : <TextField label={e.code} value={record.code} readOnly />}
            <SwitchField label={active ? t.common.active : t.common.disabled} checked={active} onChange={setActive} hint={e.statusHelp} />
          </div>
        </DetailPanel>
        <DetailPanel title={e.pricing}>
          <PriceEditor value={price} onChange={setPrice} errors={errors} />
        </DetailPanel>
        <DetailPanel title={e.associations}>
          <Fieldset legend={e.appliesTo}>
            <div className={styles.checkGrid}>
              {NEEDS.map((need) => (
                <CheckField key={need} label={(t.needs as Record<string, string>)[need]} checked={appliesTo.includes(need)} onChange={(on) => setAppliesTo(on ? [...appliesTo, need] : appliesTo.filter((item) => item !== need))} />
              ))}
            </div>
            {errors.appliesTo && <p className={styles.error}>{message(t, errors.appliesTo)}</p>}
          </Fieldset>
        </DetailPanel>
        <DetailPanel title={e.texts}>
          <p className={styles.hint}>{e.textsHelp}</p>
          <TextsEditor fields={EXTRA_FIELDS} values={texts} errors={errors} idBase="extra-texts" onChange={(language: Language, name, value) => setTexts({ ...texts, [language]: { ...texts[language], [name]: value } })} />
        </DetailPanel>
        <Footer busy={busy} label={record ? e.save : e.create} back={back} />
      </form>
    </>
  )
}

