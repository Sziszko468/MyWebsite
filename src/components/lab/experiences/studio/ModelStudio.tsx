import { lazy, useEffect, useRef, useState, type ChangeEvent, type RefObject } from 'react'
import { fill, useLabText, useLocalized } from '../../core/useLabText'
import { ExperienceFrame } from '../../experience/ExperienceFrame'
import { ExperienceStage } from '../../experience/ExperienceStage'
import { isTypingTarget } from '../../experience/input'
import { downloadJson, readFileText, safeFilename } from '../../experience/persist'
import { useStore } from '../../experience/store'
import { Glyph, PanelSection, Stepper, TabBar, ToolButton, ToolRow, Toast } from '../../experience/ui'
import { useMedia } from '../../experience/useMedia'
import { saveArtifact } from '../../artifacts/artifactActions'
import { artifactText } from '../../artifacts/artifactText'
import { award } from '../../progress/progress'
import { LabChoice, LabSlider } from '../../ui/LabControls'
import {
  LIGHT_RIGS,
  MATERIAL_PRESETS,
  MAX_OBJECTS,
  PRESETS,
  SHAPE_KINDS,
  addObject,
  duplicateObject,
  emptyDoc,
  parseStudioDoc,
  removeObject,
  selectedObject,
  serializeStudioDoc,
  setLighting,
  starterDoc,
  updateMaterial,
  updateObject,
  type LightRig,
  type MaterialPreset,
  type ShapeKind,
  type StudioDoc,
  type StudioObject,
  type Vec3,
} from './studioDoc'
import {
  commit,
  patchUi,
  readSavedProject,
  redo,
  replaceDoc,
  saveProject,
  select,
  setMessage,
  studio,
  undo,
  type Tool,
} from './studioStore'
import { studioText } from './studioText'
import type { StudioApi } from './StudioScene'
import styles from './ModelStudio.module.scss'

// The scene (Three.js, the gizmos, the materials) loads after the page's panels.
const StudioScene = lazy(() => import('./StudioScene'))

const CAMERA = { fov: 42, position: [6, 5, 8] as [number, number, number], near: 0.1, far: 400 }

type TabId = 'add' | 'transform' | 'material' | 'light' | 'project'
type Text = ReturnType<typeof useLocalized<typeof studioText>>

const SHAPE_ICONS: Record<ShapeKind, string> = {
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5',
  sphere: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  cylinder: 'M5 6c0-1.7 3-3 7-3s7 1.3 7 3-3 3-7 3-7-1.3-7-3zM5 6v12c0 1.7 3 3 7 3s7-1.3 7-3V6',
  cone: 'M12 3L5 18c0 1.7 3 3 7 3s7-1.3 7-3L12 3z',
  torus: 'M3 12a9 5 0 1 0 18 0 9 5 0 1 0-18 0zM8 12c1.5 1.5 6.5 1.5 8 0',
  plane: 'M3 15l9-9 9 9-9 4.5z',
  custom: 'M12 3l7 4v6l-3 5-4 3-4-3-3-5V7z',
}

function ShapeIcon({ kind }: { kind: ShapeKind }) {
  return (
    <Glyph>
      <path d={SHAPE_ICONS[kind]} />
    </Glyph>
  )
}

const TOOL_ICONS: Record<Tool, string> = {
  select: 'M6 4l12 7-5 1.5L11 18z',
  move: 'M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3',
  rotate: 'M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5',
  scale: 'M5 19V9h10v10zM13 11l7-7M15 4h5v5',
}

// ── Panels ─────────────────────────────────────────────────────────────────────────────

function AddPanel({ t }: { t: Text }) {
  const full = useStore(studio, (s) => s.doc.objects.length >= MAX_OBJECTS)
  return (
    <PanelSection title={t.add.title}>
      <div className={styles.shapes}>
        {SHAPE_KINDS.map((kind) => (
          <ToolButton
            key={kind}
            label={t.add[kind]}
            icon={<ShapeIcon kind={kind} />}
            disabled={full}
            onClick={() => commit(addObject(studio.get().doc, kind))}
          />
        ))}
      </div>
      {full && <Toast message={fill(t.add.full, { max: MAX_OBJECTS })} tone="warning" />}
    </PanelSection>
  )
}

function Row({ object, t }: { object: StudioObject; t: Text }) {
  const selected = useStore(studio, (s) => s.doc.selectedId === object.id)
  const [renaming, setRenaming] = useState(false)
  const rename = (value: string) => {
    setRenaming(false)
    if (value.trim() && value !== object.name) commit(updateObject(studio.get().doc, object.id, { name: value }))
  }
  return (
    <li className={styles.row} data-selected={selected} data-hidden={!object.visible}>
      {renaming ? (
        <input
          className={styles.rename}
          defaultValue={object.name}
          maxLength={40}
          autoFocus
          aria-label={fill(t.hierarchy.rename, { name: object.name })}
          onBlur={(event) => rename(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') rename(event.currentTarget.value)
            if (event.key === 'Escape') setRenaming(false)
          }}
        />
      ) : (
        <button
          type="button"
          className={styles.rowName}
          aria-current={selected ? 'true' : undefined}
          aria-label={fill(t.hierarchy.select, { name: object.name })}
          onClick={() => select(object.id)}
          onDoubleClick={() => setRenaming(true)}
        >
          <span className={styles.rowIcon} data-selected={selected}>
            <ShapeIcon kind={object.kind} />
          </span>
          <span className={styles.rowText}>{object.name}</span>
          {selected && <span className="visually-hidden"> ({t.hierarchy.selected})</span>}
        </button>
      )}
      {selected && !renaming && (
        <ToolButton
          iconOnly
          label={fill(t.hierarchy.rename, { name: object.name })}
          icon={
            <Glyph>
              <path d="M4 20l1-4L16 5l3 3L8 19zM14 7l3 3" />
            </Glyph>
          }
          onClick={() => setRenaming(true)}
        />
      )}
      <ToolButton
        iconOnly
        pressed={!object.visible}
        label={fill(object.visible ? t.hierarchy.hide : t.hierarchy.show, { name: object.name })}
        icon={
          <Glyph>
            {object.visible ? (
              <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
            ) : (
              <path d="M3 3l18 18M10 6a9 9 0 0 1 12 6 12 12 0 0 1-3 3.5M6 8a12 12 0 0 0-4 4s4 7 10 7a9 9 0 0 0 3-.5" />
            )}
          </Glyph>
        }
        onClick={() => commit(updateObject(studio.get().doc, object.id, { visible: !object.visible }))}
      />
      <ToolButton
        iconOnly
        pressed={object.locked}
        label={fill(object.locked ? t.hierarchy.unlock : t.hierarchy.lock, { name: object.name })}
        icon={
          <Glyph>
            <path d={object.locked ? 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3' : 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 7.5-2'} />
          </Glyph>
        }
        onClick={() => commit(updateObject(studio.get().doc, object.id, { locked: !object.locked }))}
      />
      <ToolButton
        iconOnly
        tone="danger"
        label={fill(t.hierarchy.remove, { name: object.name })}
        icon={
          <Glyph>
            <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" />
          </Glyph>
        }
        onClick={() => commit(removeObject(studio.get().doc, object.id))}
      />
    </li>
  )
}

function HierarchyPanel({ t }: { t: Text }) {
  const objects = useStore(studio, (s) => s.doc.objects)
  return (
    <PanelSection title={`${t.hierarchy.title} · ${fill(t.hierarchy.count, { count: objects.length })}`}>
      {objects.length === 0 ? (
        <p className={styles.empty}>{t.hierarchy.empty}</p>
      ) : (
        <ul className={styles.list} aria-label={t.hierarchy.title}>
          {objects.map((object) => (
            <Row key={object.id} object={object} t={t} />
          ))}
        </ul>
      )}
    </PanelSection>
  )
}

const toDegrees = (radians: number) => (radians * 180) / Math.PI
const toRadians = (degrees: number) => (degrees * Math.PI) / 180

function TransformPanel({ t }: { t: Text }) {
  const object = useStore(studio, (s) => selectedObject(s.doc))
  if (!object) {
    return (
      <PanelSection title={t.transform.title}>
        <p className={styles.empty}>{t.transform.none}</p>
      </PanelSection>
    )
  }
  const set = (patch: Partial<StudioObject>) => commit(updateObject(studio.get().doc, object.id, patch))
  const axis = (vec: Vec3, index: number, value: number): Vec3 => vec.map((v, i) => (i === index ? value : v)) as Vec3
  const axes = ['x', 'y', 'z'] as const
  const locked = object.locked
  return (
    <PanelSection title={t.transform.title}>
      <label className={styles.nameField}>
        <span>{t.transform.name}</span>
        <input
          key={object.id + object.name}
          defaultValue={object.name}
          maxLength={40}
          onBlur={(event) =>
            event.currentTarget.value.trim() &&
            event.currentTarget.value !== object.name &&
            set({ name: event.currentTarget.value })
          }
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
        />
      </label>
      {locked && <Toast message={t.transform.locked} tone="warning" />}
      <fieldset className={styles.group} disabled={locked}>
        <legend>{t.transform.position}</legend>
        {axes.map((a, i) => (
          <Stepper
            key={a}
            axis={a}
            label={a.toUpperCase()}
            value={object.position[i]}
            step={0.1}
            min={-100}
            max={100}
            onChange={(v) => set({ position: axis(object.position, i, v) })}
          />
        ))}
      </fieldset>
      <fieldset className={styles.group} disabled={locked}>
        <legend>{t.transform.rotation}</legend>
        {axes.map((a, i) => (
          <Stepper
            key={a}
            axis={a}
            label={a.toUpperCase()}
            value={toDegrees(object.rotation[i])}
            step={5}
            digits={1}
            onChange={(v) => set({ rotation: axis(object.rotation, i, toRadians(v)) })}
          />
        ))}
      </fieldset>
      <fieldset className={styles.group} disabled={locked}>
        <legend>{t.transform.scale}</legend>
        {axes.map((a, i) => (
          <Stepper
            key={a}
            axis={a}
            label={a.toUpperCase()}
            value={object.scale[i]}
            step={0.1}
            min={0.05}
            max={40}
            onChange={(v) => set({ scale: axis(object.scale, i, v) })}
          />
        ))}
      </fieldset>
      {object.kind === 'custom' && (
        <fieldset className={styles.group}>
          <legend>{t.transform.custom}</legend>
          <LabSlider
            label={t.transform.sides}
            value={object.custom.sides}
            min={3}
            max={12}
            step={1}
            onChange={(sides) => set({ custom: { ...object.custom, sides } })}
          />
          <LabSlider
            label={t.transform.twist}
            value={object.custom.twist}
            min={-360}
            max={360}
            step={5}
            onChange={(twist) => set({ custom: { ...object.custom, twist } })}
          />
          <LabSlider
            label={t.transform.taper}
            value={object.custom.taper}
            min={0}
            max={1.5}
            step={0.05}
            onChange={(taper) => set({ custom: { ...object.custom, taper } })}
          />
          <LabSlider
            label={t.transform.slices}
            value={object.custom.slices}
            min={1}
            max={24}
            step={1}
            onChange={(slices) => set({ custom: { ...object.custom, slices } })}
          />
        </fieldset>
      )}
      <ToolRow>
        <ToolButton
          label={t.transform.duplicate}
          icon={
            <Glyph>
              <path d="M8 8h11v11H8zM5 16V5h11" />
            </Glyph>
          }
          onClick={() => commit(duplicateObject(studio.get().doc, object.id))}
        />
        <ToolButton
          label={object.visible ? t.transform.hide : t.transform.show}
          pressed={!object.visible}
          icon={
            <Glyph>
              <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
            </Glyph>
          }
          onClick={() => set({ visible: !object.visible })}
        />
        <ToolButton
          label={locked ? t.transform.unlock : t.transform.lock}
          pressed={locked}
          icon={
            <Glyph>
              <path d="M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3" />
            </Glyph>
          }
          onClick={() => set({ locked: !locked })}
        />
        <ToolButton
          tone="danger"
          label={t.transform.delete}
          icon={
            <Glyph>
              <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13" />
            </Glyph>
          }
          onClick={() => commit(removeObject(studio.get().doc, object.id))}
        />
      </ToolRow>
    </PanelSection>
  )
}

function MaterialPanel({ t }: { t: Text }) {
  const object = useStore(studio, (s) => selectedObject(s.doc))
  if (!object) {
    return (
      <PanelSection title={t.material.title}>
        <p className={styles.empty}>{t.material.none}</p>
      </PanelSection>
    )
  }
  const { material } = object
  const set = (patch: Partial<typeof material>) => commit(updateMaterial(studio.get().doc, object.id, patch))
  const supportsOpacity = PRESETS[material.preset].supportsOpacity
  const percent = (value: number) => `${Math.round(value * 100)}%`
  return (
    <PanelSection title={t.material.title}>
      <div className={styles.presets} role="group" aria-label={t.material.title}>
        {MATERIAL_PRESETS.map((preset: MaterialPreset) => (
          <button
            key={preset}
            type="button"
            className={styles.preset}
            aria-pressed={material.preset === preset}
            onClick={() => set({ preset })}
          >
            <span
              className={styles.swatch}
              style={{ background: PRESETS[preset].color }}
              data-preset={preset}
              aria-hidden="true"
            />
            <span>{t.material[preset]}</span>
          </button>
        ))}
      </div>
      <label className={styles.colour}>
        <span>{t.material.color}</span>
        <input type="color" value={material.color} onChange={(event) => set({ color: event.currentTarget.value })} />
        <output>{material.color.toUpperCase()}</output>
      </label>
      <LabSlider
        label={t.material.roughness}
        value={material.roughness}
        min={0}
        max={1}
        step={0.01}
        format={percent}
        onChange={(roughness) => set({ roughness })}
      />
      <LabSlider
        label={t.material.metalness}
        value={material.metalness}
        min={0}
        max={1}
        step={0.01}
        format={percent}
        onChange={(metalness) => set({ metalness })}
      />
      <div aria-disabled={!supportsOpacity} className={styles.optional}>
        <LabSlider
          label={t.material.opacity}
          value={material.opacity}
          min={0.05}
          max={1}
          step={0.01}
          format={percent}
          onChange={(opacity) => supportsOpacity && set({ opacity })}
        />
        {!supportsOpacity && <p className={styles.note}>{t.material.opacityOff}</p>}
      </div>
      <LabSlider
        label={t.material.emissive}
        value={material.emissive}
        min={0}
        max={2}
        step={0.05}
        format={percent}
        onChange={(emissive) => set({ emissive })}
      />
    </PanelSection>
  )
}

function LightPanel({ t }: { t: Text }) {
  const lighting = useStore(studio, (s) => s.doc.lighting)
  const set = (patch: Partial<typeof lighting>) => commit(setLighting(studio.get().doc, patch))
  const percent = (value: number) => `${Math.round(value * 100)}%`
  return (
    <PanelSection title={t.light.title}>
      <LabChoice<LightRig>
        label={t.light.rig}
        value={lighting.rig}
        options={LIGHT_RIGS.map((rig) => ({ value: rig, label: t.light[rig] }))}
        onChange={(rig) => set({ rig })}
        columns={2}
      />
      <LabSlider
        label={t.light.intensity}
        value={lighting.intensity}
        min={0.2}
        max={2}
        step={0.05}
        format={percent}
        onChange={(intensity) => set({ intensity })}
      />
      <LabSlider
        label={t.light.azimuth}
        value={lighting.azimuth}
        min={0}
        max={360}
        step={5}
        format={(v) => `${v}°`}
        onChange={(azimuth) => set({ azimuth })}
      />
      <LabSlider
        label={t.light.elevation}
        value={lighting.elevation}
        min={5}
        max={85}
        step={1}
        format={(v) => `${v}°`}
        onChange={(elevation) => set({ elevation })}
      />
    </PanelSection>
  )
}

function ProjectPanel({ t, api }: { t: Text; api: RefObject<StudioApi | null> }) {
  const a = useLocalized(artifactText)
  const message = useStore(studio, (s) => s.message)
  const file = useRef<HTMLInputElement>(null)

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!picked) return
    try {
      const text = await readFileText(picked, 1_000_000)
      const doc = parseStudioDoc(JSON.parse(text))
      if (doc) replaceDoc(doc, t.messages.loaded)
      else setMessage(t.messages.badFile)
    } catch (error) {
      setMessage(error instanceof Error && error.message === 'too-large' ? t.messages.tooBig : t.messages.badFile)
    }
  }

  return (
    <PanelSection title={t.project.title}>
      <p className={styles.note}>{t.project.note}</p>
      <div className={styles.actions}>
        <ToolButton
          label={t.project.save}
          icon={
            <Glyph>
              <path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6" />
            </Glyph>
          }
          onClick={() => {
            const saved = saveProject().ok
            if (saved && studio.get().doc.objects.length > 0) award('model:saved', 10, 'first-model')
            setMessage(saved ? t.messages.saved : t.messages.saveFailed)
          }}
        />
        <ToolButton
          label={a.save}
          icon={
            <Glyph>
              <path d="M4 7h16v12H4zM4 7l3-3h10l3 3M9 12h6" />
            </Glyph>
          }
          disabled={studio.get().doc.objects.length === 0}
          onClick={async () => {
            const doc = studio.get().doc
            const stamp = new Date().toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
            const result = await saveArtifact({
              type: 'model',
              name: `Model ${stamp}`,
              payload: serializeStudioDoc(doc) as unknown as Record<string, unknown>,
            })
            if (result.ok) award('model:saved', 10, 'first-model')
            setMessage(result.ok ? (result.persistent ? a.saved : a.savedSession) : a.failed[result.reason])
          }}
        />
        <ToolButton
          label={t.project.load}
          icon={
            <Glyph>
              <path d="M4 7h6l2 2h8v10H4zM12 11v6M9 14l3 3 3-3" />
            </Glyph>
          }
          onClick={() => {
            const saved = readSavedProject()
            if (saved) replaceDoc(saved, t.messages.loaded)
            else setMessage(t.messages.nothingSaved)
          }}
        />
        <ToolButton
          label={t.project.download}
          icon={
            <Glyph>
              <path d="M12 4v11M7 11l5 5 5-5M5 20h14" />
            </Glyph>
          }
          onClick={() => {
            downloadJson(serializeStudioDoc(studio.get().doc), safeFilename('model-studio-project', 'json'))
            setMessage(t.messages.downloaded)
          }}
        />
        <ToolButton
          label={t.project.open}
          icon={
            <Glyph>
              <path d="M12 20V9M7 13l5-5 5 5M5 4h14" />
            </Glyph>
          }
          onClick={() => file.current?.click()}
        />
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={onFile}
          aria-label={t.project.open}
        />
      </div>
      <div className={styles.actions}>
        <ToolButton
          label={t.project.glb}
          icon={
            <Glyph>
              <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12v9M12 12L4 7.5" />
            </Glyph>
          }
          onClick={async () => {
            try {
              const ok = await api.current?.exportGlb()
              setMessage(ok ? t.messages.exported : t.messages.nothingToExport)
            } catch {
              setMessage(t.messages.exportFailed)
            }
          }}
        />
        <ToolButton
          label={t.project.screenshot}
          icon={
            <Glyph>
              <path d="M4 8h3l2-3h6l2 3h3v11H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
            </Glyph>
          }
          onClick={() => {
            api.current?.screenshot()
            setMessage(t.messages.screenshot)
          }}
        />
      </div>
      <p className={styles.note}>{t.project.glbNote}</p>
      <div className={styles.actions}>
        <ToolButton label={t.project.resetStarter} onClick={() => replaceDoc(starterDoc(), t.messages.loaded)} />
        <ToolButton tone="danger" label={t.project.reset} onClick={() => replaceDoc(emptyDoc(), t.messages.newScene)} />
      </div>
      <Toast
        message={message}
        tone={
          Object.values(a.failed).includes(message) ||
          message === t.messages.saveFailed ||
          message === t.messages.badFile ||
          message === t.messages.exportFailed
            ? 'error'
            : 'info'
        }
      />
    </PanelSection>
  )
}

// ── The viewport's own controls ─────────────────────────────────────────────────────────

function Toolbar({ t, api }: { t: Text; api: RefObject<StudioApi | null> }) {
  const tool = useStore(studio, (s) => s.tool)
  const snap = useStore(studio, (s) => s.snap)
  const ortho = useStore(studio, (s) => s.ortho)
  const grid = useStore(studio, (s) => s.grid)
  const axes = useStore(studio, (s) => s.axes)
  const canUndo = useStore(studio, (s) => s.past.length > 0)
  const canRedo = useStore(studio, (s) => s.future.length > 0)
  const tools: Array<{ id: Tool; key: string }> = [
    { id: 'select', key: 'Q' },
    { id: 'move', key: 'W' },
    { id: 'rotate', key: 'E' },
    { id: 'scale', key: 'R' },
  ]
  return (
    <div className={styles.toolbar}>
      <ToolRow label={t.tools.group} className={styles.toolGroup}>
        {tools.map(({ id, key }) => (
          <ToolButton
            key={id}
            iconOnly
            label={t.tools[id]}
            shortcut={key}
            pressed={tool === id}
            icon={
              <Glyph>
                <path d={TOOL_ICONS[id]} />
              </Glyph>
            }
            onClick={() => patchUi({ tool: id })}
          />
        ))}
        <ToolButton
          iconOnly
          label={t.tools.snap}
          pressed={snap}
          icon={
            <Glyph>
              <path d="M5 5h2M11 5h2M17 5h2M5 12h2M11 12h2M17 12h2M5 19h2M11 19h2M17 19h2" />
            </Glyph>
          }
          onClick={() => patchUi({ snap: !snap })}
        />
        <ToolButton
          iconOnly
          label={t.tools.undo}
          shortcut="Ctrl+Z"
          disabled={!canUndo}
          icon={
            <Glyph>
              <path d="M9 7H5v4M5.5 11A7 7 0 1 1 8 17" />
            </Glyph>
          }
          onClick={undo}
        />
        <ToolButton
          iconOnly
          label={t.tools.redo}
          shortcut="Ctrl+Y"
          disabled={!canRedo}
          icon={
            <Glyph>
              <path d="M15 7h4v4M18.5 11A7 7 0 1 0 16 17" />
            </Glyph>
          }
          onClick={redo}
        />
      </ToolRow>
      <ToolRow label={t.view.group} className={styles.toolGroup}>
        <ToolButton
          iconOnly
          label={ortho ? t.view.orthographic : t.view.perspective}
          pressed={ortho}
          icon={
            <Glyph>
              <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5" />
            </Glyph>
          }
          onClick={() => patchUi({ ortho: !ortho })}
        />
        <ToolButton
          iconOnly
          label={t.view.front}
          icon={<span className={styles.viewText}>F</span>}
          onClick={() => api.current?.view('front')}
        />
        <ToolButton
          iconOnly
          label={t.view.right}
          icon={<span className={styles.viewText}>R</span>}
          onClick={() => api.current?.view('right')}
        />
        <ToolButton
          iconOnly
          label={t.view.top}
          icon={<span className={styles.viewText}>T</span>}
          onClick={() => api.current?.view('top')}
        />
        <ToolButton
          iconOnly
          label={t.view.iso}
          icon={<span className={styles.viewText}>I</span>}
          onClick={() => api.current?.view('iso')}
        />
        <ToolButton
          iconOnly
          label={t.view.frame}
          shortcut="F"
          icon={
            <Glyph>
              <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
            </Glyph>
          }
          onClick={() => api.current?.frame()}
        />
        <ToolButton
          iconOnly
          label={t.view.grid}
          pressed={grid}
          icon={
            <Glyph>
              <path d="M4 4h16v16H4zM4 12h16M12 4v16" />
            </Glyph>
          }
          onClick={() => patchUi({ grid: !grid })}
        />
        <ToolButton
          iconOnly
          label={t.view.axes}
          pressed={axes}
          icon={
            <Glyph>
              <path d="M5 19V5M5 19h14M5 19l8-8" />
            </Glyph>
          }
          onClick={() => patchUi({ axes: !axes })}
        />
      </ToolRow>
    </div>
  )
}

function Readout() {
  const drag = useStore(studio, (s) => s.drag)
  const tool = useStore(studio, (s) => s.tool)
  const name = useStore(studio, (s) => selectedObject(s.doc)?.name ?? '')
  return (
    <p className={styles.readout} aria-hidden="true" data-active={!!drag}>
      {drag ? drag : name ? `${name} · ${tool}` : ''}
    </p>
  )
}

// ── The page ──────────────────────────────────────────────────────────────────────────

function StudioApp() {
  const t = useLocalized(studioText)
  const { experiments } = useLabText()
  const api = useRef<StudioApi | null>(null)
  const wide = useMedia('(min-width: 68.75rem)')
  const touch = useMedia('(pointer: coarse)')
  const [tab, setTab] = useState<TabId | null>('add')

  // Keyboard shortcuts, for a desk: the page is not a text field, so these never fight typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target) || event.altKey) return
      const state = studio.get()
      const mod = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      if (mod && key === 'z') (event.shiftKey ? redo : undo)()
      else if (mod && key === 'y') redo()
      else if (mod && key === 'd' && state.doc.selectedId) commit(duplicateObject(state.doc, state.doc.selectedId))
      else if (mod) return
      else if (key === 'q') patchUi({ tool: 'select' })
      else if (key === 'w') patchUi({ tool: 'move' })
      else if (key === 'e') patchUi({ tool: 'rotate' })
      else if (key === 'r') patchUi({ tool: 'scale' })
      else if (key === 'f') api.current?.frame()
      else if (key === 'g') patchUi({ grid: !state.grid })
      else if (key === 'h' && state.doc.selectedId) {
        const object = selectedObject(state.doc)
        if (object) commit(updateObject(state.doc, object.id, { visible: !object.visible }))
      } else if ((key === 'delete' || key === 'backspace') && state.doc.selectedId)
        commit(removeObject(state.doc, state.doc.selectedId))
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const tabs = [
    {
      id: 'add' as const,
      label: t.tabs.add,
      icon: (
        <Glyph>
          <path d="M12 5v14M5 12h14" />
        </Glyph>
      ),
    },
    {
      id: 'transform' as const,
      label: t.tabs.transform,
      icon: (
        <Glyph>
          <path d={TOOL_ICONS.move} />
        </Glyph>
      ),
    },
    {
      id: 'material' as const,
      label: t.tabs.material,
      icon: (
        <Glyph>
          <circle cx="12" cy="12" r="8" />
          <path d="M8 9a5 5 0 0 1 4-2" />
        </Glyph>
      ),
    },
    {
      id: 'light' as const,
      label: t.tabs.light,
      icon: (
        <Glyph>
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M6 6l1.5 1.5M16.5 16.5L18 18M18 6l-1.5 1.5M7.5 16.5L6 18M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
        </Glyph>
      ),
    },
    {
      id: 'project' as const,
      label: t.tabs.project,
      icon: (
        <Glyph>
          <path d="M5 4h11l3 3v13H5zM8 4v5h7V4" />
        </Glyph>
      ),
    },
  ]

  const dock = (
    <div className={styles.dock} data-open={tab !== null}>
      <TabBar
        label={t.tabs.label}
        tabs={tabs}
        value={tab ?? 'add'}
        onChange={(id) => setTab((current) => (current === id ? null : id))}
        className={styles.dockTabs}
      />
      {tab && (
        <div className={styles.dockBody} role="tabpanel">
          {tab === 'add' && (
            <>
              <AddPanel t={t} />
              <HierarchyPanel t={t} />
            </>
          )}
          {tab === 'transform' && <TransformPanel t={t} />}
          {tab === 'material' && <MaterialPanel t={t} />}
          {tab === 'light' && <LightPanel t={t} />}
          {tab === 'project' && <ProjectPanel t={t} api={api} />}
        </div>
      )}
    </div>
  )

  return (
    <div className={styles.studio} data-wide={wide}>
      {wide && (
        <aside className={styles.side} aria-label={t.hierarchy.title}>
          <AddPanel t={t} />
          <HierarchyPanel t={t} />
        </aside>
      )}

      <div className={styles.viewport}>
        <ExperienceStage
          label={experiments['model-studio'].stageLabel}
          camera={CAMERA}
          antialias
          onDemand
          overlay={
            <>
              <Toolbar t={t} api={api} />
              <Readout />
              {!touch && wide && <p className={styles.keys}>{t.keys}</p>}
            </>
          }
        >
          <StudioScene apiRef={api} />
        </ExperienceStage>
      </div>

      {wide ? (
        <aside className={styles.side} aria-label={t.tabs.label}>
          <TransformPanel t={t} />
          <MaterialPanel t={t} />
          <LightPanel t={t} />
          <ProjectPanel t={t} api={api} />
        </aside>
      ) : (
        dock
      )}
    </div>
  )
}

/** Model Studio: an interactive 3D modelling studio. */
export default function ModelStudio() {
  return (
    <ExperienceFrame id="model-studio">
      <StudioApp />
    </ExperienceFrame>
  )
}

export type { StudioDoc }
