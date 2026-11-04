import { useCallback, useEffect, useRef, useState } from 'react'

export interface Resource<T> {
  data: T | null
  error: unknown
  /** The first load is in progress and there is nothing to show yet. */
  loading: boolean
  /** A later load (after a change, or "try again") is in progress; what was loaded stays on screen meanwhile. */
  refreshing: boolean
  reload: () => void
  /** Replace what is shown with what a save has just returned, without asking the server again. */
  set: (value: T) => void
}

/**
 * Loads something when the screen opens and whenever `deps` change, with the four states every screen has to show
 * (loading, failed, loaded, loaded again). A request that is overtaken by a newer one is aborted and its answer is
 * never shown, so a fast typist cannot see the results of an earlier search after the later one.
 */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, deps: readonly unknown[]): Resource<T> {
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean; refreshing: boolean }>({ data: null, error: null, loading: true, refreshing: false })
  const [round, setRound] = useState(0)
  const loader = useRef(load)
  loader.current = load

  useEffect(() => {
    const controller = new AbortController()
    setState((previous) => ({ ...previous, error: null, loading: previous.data === null, refreshing: previous.data !== null }))
    loader
      .current(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, error: null, loading: false, refreshing: false })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
        setState((previous) => ({ ...previous, error, loading: false, refreshing: false }))
      })
    return () => controller.abort()
    // The caller names what the load depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, round])

  const reload = useCallback(() => setRound((value) => value + 1), [])
  const set = useCallback((data: T) => setState({ data, error: null, loading: false, refreshing: false }), [])
  return { ...state, reload, set }
}
