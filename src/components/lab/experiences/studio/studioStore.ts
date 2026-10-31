import { createStore } from '../../experience/store'
import { loadJson, saveJson, type SaveResult } from '../../experience/persist'
import { parseStudioDoc, serializeStudioDoc, starterDoc, type StudioDoc } from './studioDoc'
import {
  GEN_DEFAULTS,
  generate,
  isGenerated,
  randomGen,
  sanitizeGen,
  unexpected,
  type GenParams,
} from './studioGenerator'

/**
 * The studio's state: the document with its undo history, and the few things about the editor that
 * are not part of a project (which tool is active, whether to snap, which camera). One store, so
 * the viewport and every panel read and write the same thing.
 */
export type Tool = 'select' | 'move' | 'rotate' | 'scale'

export interface StudioState {
  doc: StudioDoc
  past: StudioDoc[]
  future: StudioDoc[]
  tool: Tool
  snap: boolean
  ortho: boolean
  grid: boolean
  axes: boolean
  /** A one-line note about the last thing that happened (saved, exported, refused). */
  message: string
  /** A live readout while a handle is being dragged, "" otherwise. */
  drag: string
}

const HISTORY_LIMIT = 60
export const PROJECT_KEY = 'lab:studio:project'

export function createStudioState(doc: StudioDoc = starterDoc()): StudioState {
  return {
    doc,
    past: [],
    future: [],
    tool: 'move',
    snap: false,
    ortho: false,
    grid: true,
    axes: true,
    message: '',
    drag: '',
  }
}

export const studio = createStore<StudioState>(createStudioState())

/** Replaces the document and remembers the old one, so Undo can bring it back. */
export function commit(next: StudioDoc): void {
  studio.set((state) =>
    next === state.doc
      ? state
      : { ...state, doc: next, past: [...state.past, state.doc].slice(-HISTORY_LIMIT), future: [] },
  )
}

/** Changes the document without a history step: for a drag in progress, which is one step when it ends. */
export function transient(next: StudioDoc): void {
  studio.set((state) => (next === state.doc ? state : { ...state, doc: next }))
}

/** Records `before` as an undo step if the document is different now. */
export function pushHistory(before: StudioDoc): void {
  studio.set((state) =>
    before === state.doc ? state : { ...state, past: [...state.past, before].slice(-HISTORY_LIMIT), future: [] },
  )
}

/** Selection is not an edit: it never enters the history. */
export function select(id: string | null): void {
  studio.set((state) => (state.doc.selectedId === id ? state : { ...state, doc: { ...state.doc, selectedId: id } }))
}

export function undo(): void {
  studio.set((state) => {
    const previous = state.past[state.past.length - 1]
    if (!previous) return state
    return {
      ...state,
      doc: previous,
      past: state.past.slice(0, -1),
      future: [state.doc, ...state.future].slice(0, HISTORY_LIMIT),
    }
  })
}

export function redo(): void {
  studio.set((state) => {
    const next = state.future[0]
    if (!next) return state
    return {
      ...state,
      doc: next,
      past: [...state.past, state.doc].slice(-HISTORY_LIMIT),
      future: state.future.slice(1),
    }
  })
}

/** Loads a whole project and starts its history afresh. */
export function replaceDoc(doc: StudioDoc, message = ''): void {
  studio.set((state) => ({ ...state, doc, past: [], future: [], message, drag: '' }))
}

export function setMessage(message: string): void {
  studio.set((state) => (state.message === message ? state : { ...state, message }))
}

export function patchUi(patch: Partial<Pick<StudioState, 'tool' | 'snap' | 'ortho' | 'grid' | 'axes' | 'drag'>>): void {
  studio.set((state) => ({ ...state, ...patch }))
}

/** Saves the project in this browser. */
export function saveProject(): SaveResult {
  return saveJson(PROJECT_KEY, serializeStudioDoc(studio.get().doc))
}

/** The project saved in this browser, if there is one and it is valid. */
export function readSavedProject(): StudioDoc | null {
  return loadJson(PROJECT_KEY, parseStudioDoc)
}

/** The generator's numbers: kept here so they survive the panel moving between the side and the dock. */
export const generator = createStore<GenParams>({ ...GEN_DEFAULTS })

export function setGenerator(patch: Partial<GenParams>): void {
  generator.set((state) => sanitizeGen({ ...state, ...patch }))
}

// What the generator last put in the document. While the document is still that very object, the next
// generation replaces it in place, so a whole session of tweaking sliders is one undo step.
let lastGenerated: StudioDoc | null = null

/** True while the document holds pieces the generator made, so a slider can regenerate them live. */
export const hasGenerated = (): boolean => studio.get().doc.objects.some((object) => isGenerated(object.name))

/** Builds the composition from the generator's numbers; returns how many pieces it made. */
export function applyGenerator(): number {
  const state = studio.get()
  const built = generate(state.doc, generator.get())
  const next = { ...built, selectedId: null }
  if (state.doc === lastGenerated) transient(next)
  else commit(next)
  lastGenerated = next
  return next.objects.filter((object) => isGenerated(object.name)).length
}

/** A whole new scene from one seed: replaces the document (Undo brings the old one back). */
export function createUnexpected(seed: number): StudioDoc {
  const next = unexpected(seed)
  setGenerator(randomGen(seed))
  commit(next)
  lastGenerated = next
  return next
}
