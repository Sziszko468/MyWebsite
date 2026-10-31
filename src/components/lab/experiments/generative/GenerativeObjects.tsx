import { lazy, useCallback, useEffect, useState, type FormEvent, type RefObject } from 'react'
import { useSearchParams } from 'react-router'
import { fill, useLabText, useLocalized } from '../../core/useLabText'
import { ExperimentFrame } from '../../ui/ExperimentFrame'
import { LabAction, LabActions, LabChoice, LabGroup, LabNote, LabSlider } from '../../ui/LabControls'
import styles from './GenerativeObjects.module.scss'
import {
  addSaved,
  freshSeed,
  FORMS,
  GEN_DEFAULTS,
  genText,
  MATERIAL_IDS,
  PALETTE_IDS,
  paramsFromSeed,
  parseSeedCode,
  sanitizeParams,
  seedCode,
  SYMMETRY_RANGE,
  type FormId,
  type GenMaterialId,
  type GenParams,
  type PaletteId,
  type SavedObject,
} from './genParams'
import type { GenControls } from './GenScene'

// The scene (Three.js, the geometry builders, the shaders) loads after the page's words and controls.
const GenScene = lazy(() => import('./GenScene'))

const CAMERA = { fov: 38, position: [0, 0, 6.6] as [number, number, number] }

/** What the panel writes into the URL, so a shared address makes the same object. */
function useSeedInUrl() {
  const [searchParams, setSearchParams] = useSearchParams()
  const write = useCallback(
    (seed: number | null) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          if (seed === null) next.delete('seed')
          else next.set('seed', seedCode(seed))
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )
  return { searchParams, write }
}

function GenPanel({ controls, onFullView }: { controls: RefObject<GenControls>; onFullView: () => void }) {
  const t = useLocalized(genText)
  const { text } = useLabText()
  const { write } = useSeedInUrl()
  const [params, setParams] = useState<GenParams>(controls.current.params)
  const [saved, setSaved] = useState<SavedObject[]>([])
  const [seedText, setSeedText] = useState(() => seedCode(controls.current.params.seed))
  const [seedInvalid, setSeedInvalid] = useState(false)
  const [notice, setNotice] = useState('')

  // The scene reads the same parameters from the ref; each change bumps a revision so it rebuilds.
  const apply = (next: GenParams) => {
    const clean = sanitizeParams(next)
    controls.current = { ...controls.current, params: clean, revision: controls.current.revision + 1 }
    setParams(clean)
    setSeedText(seedCode(clean.seed))
    setSeedInvalid(false)
  }
  const patch = (change: Partial<GenParams>) => apply({ ...params, ...change })

  const generate = () => {
    const seed = freshSeed()
    apply(paramsFromSeed(seed))
    write(seed)
    setNotice('')
  }

  const applySeed = (event: FormEvent) => {
    event.preventDefault()
    const seed = parseSeedCode(seedText)
    if (seed === null) {
      setSeedInvalid(true)
      return
    }
    apply(paramsFromSeed(seed))
    write(seed)
  }

  const reset = () => {
    apply({ ...GEN_DEFAULTS })
    write(null)
    setNotice('')
  }

  const save = () => {
    const snapshot = params
    controls.current.onCapture = (picture) => {
      setSaved((list) => addSaved(list, { params: snapshot, picture }))
      setNotice(t.saved)
    }
    controls.current = { ...controls.current, captureVersion: controls.current.captureVersion + 1 }
  }

  const percent = (value: number) => `${Math.round(value * 100)}%`
  const describe = (object: SavedObject) => `${t.forms[object.params.form]}, ${seedCode(object.params.seed)}`

  return (
    <>
      <LabGroup>
        <form className={styles.seed} onSubmit={applySeed} noValidate>
          <label className={styles.seedLabel} htmlFor="gen-seed">
            {t.seed}
          </label>
          <div className={styles.seedRow}>
            <input
              id="gen-seed"
              className={styles.seedInput}
              value={seedText}
              onChange={(event) => setSeedText(event.currentTarget.value)}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={seedInvalid}
              aria-describedby="gen-seed-help"
            />
            <LabAction type="submit" className={styles.seedApply}>
              {t.apply}
            </LabAction>
          </div>
          <p
            id="gen-seed-help"
            className={seedInvalid ? styles.seedError : styles.seedHelp}
            role={seedInvalid ? 'alert' : undefined}
          >
            {seedInvalid ? t.seedInvalid : t.seedHelp}
          </p>
        </form>
        <LabActions>
          <LabAction variant="primary" onClick={generate}>
            {t.generate}
          </LabAction>
          <LabAction onClick={save}>{t.save}</LabAction>
        </LabActions>
        <LabNote live>{notice}</LabNote>
      </LabGroup>

      <LabGroup>
        <LabChoice<FormId>
          label={t.form}
          value={params.form}
          options={FORMS.map((form) => ({ value: form, label: t.forms[form] }))}
          onChange={(form) => patch({ form })}
          columns={3}
        />
        <LabSlider
          label={t.complexity}
          value={params.complexity}
          min={0}
          max={1}
          step={0.02}
          format={percent}
          onChange={(complexity) => patch({ complexity })}
        />
        <LabSlider
          label={t.depth}
          value={params.depth}
          min={0}
          max={1}
          step={0.02}
          format={percent}
          onChange={(depth) => patch({ depth })}
        />
        <LabSlider
          label={t.distortion}
          value={params.distortion}
          min={0}
          max={1}
          step={0.02}
          format={percent}
          onChange={(distortion) => patch({ distortion })}
        />
        <LabSlider
          label={t.symmetry}
          value={params.symmetry}
          min={SYMMETRY_RANGE.min}
          max={SYMMETRY_RANGE.max}
          step={1}
          format={(value) => `${value}×`}
          onChange={(symmetry) => patch({ symmetry })}
        />
      </LabGroup>

      <LabGroup>
        <LabChoice<GenMaterialId>
          label={t.material}
          value={params.material}
          options={MATERIAL_IDS.map((material) => ({ value: material, label: t.materials[material] }))}
          onChange={(material) => patch({ material })}
          columns={4}
        />
        <LabChoice<PaletteId>
          label={t.palette}
          value={params.palette}
          options={PALETTE_IDS.map((palette) => ({ value: palette, label: t.palettes[palette] }))}
          onChange={(palette) => patch({ palette })}
          columns={4}
        />
        <LabSlider
          label={t.light}
          value={params.light}
          min={0.4}
          max={1.6}
          step={0.05}
          format={percent}
          onChange={(light) => patch({ light })}
        />
      </LabGroup>

      <LabGroup title={t.collection}>
        {saved.length === 0 ? (
          <LabNote>{t.collectionEmpty}</LabNote>
        ) : (
          <ul className={styles.saved}>
            {saved.map((object) => (
              <li
                key={`${object.params.seed}-${object.params.form}-${object.params.material}`}
                className={styles.savedItem}
              >
                <button
                  type="button"
                  className={styles.savedOpen}
                  aria-label={fill(t.open, { name: t.forms[object.params.form], code: seedCode(object.params.seed) })}
                  onClick={() => apply(object.params)}
                >
                  {object.picture ? (
                    <img className={styles.savedPicture} src={object.picture} alt="" width={160} height={160} />
                  ) : (
                    <span className={styles.savedBlank} aria-hidden="true" />
                  )}
                  <span className={styles.savedName}>{t.forms[object.params.form]}</span>
                </button>
                <button
                  type="button"
                  className={styles.savedRemove}
                  aria-label={fill(t.remove, { name: describe(object) })}
                  onClick={() => setSaved((list) => list.filter((item) => item !== object))}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </LabGroup>

      <LabActions>
        <LabAction onClick={onFullView}>{t.fullView}</LabAction>
        <LabAction onClick={reset}>{text.panel.reset}</LabAction>
      </LabActions>
    </>
  )
}

/** Generative Objects: abstract 3D objects from a handful of parameters. */
export default function GenerativeObjects() {
  const [searchParams, setSearchParams] = useSearchParams()
  const t = useLocalized(genText)
  const full = searchParams.get('view') === 'full'

  // The object a shared address makes: read once; after that the panel owns the parameters.
  const [controls] = useState<{ current: GenControls }>(() => {
    const seed = parseSeedCode(searchParams.get('seed') ?? '')
    const params = seed !== null ? paramsFromSeed(seed) : { ...GEN_DEFAULTS }
    return { current: { params, revision: 0, captureVersion: 0, onCapture: null } }
  })

  const setFull = useCallback(
    (on: boolean) => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          if (on) next.set('view', 'full')
          else next.delete('view')
          return next
        },
        // Opening adds a step to the history, so Back closes it; closing replaces it.
        { replace: !on },
      )
    },
    [setSearchParams],
  )

  useEffect(() => {
    if (!full) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFull(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full, setFull])

  return (
    <ExperimentFrame
      id="generative-objects"
      camera={CAMERA}
      antialias
      clean={full}
      topExtra={
        full ? (
          <span data-keep>
            <LabAction onClick={() => setFull(false)}>{t.closeFullView}</LabAction>
          </span>
        ) : null
      }
      scene={<GenScene controls={controls} />}
      panel={<GenPanel controls={controls} onFullView={() => setFull(true)} />}
    />
  )
}
