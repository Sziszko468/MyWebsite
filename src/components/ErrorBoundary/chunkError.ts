/**
 * Whether an error is a page's code failing to arrive (a connection that dropped, or a file that no
 * longer exists because the site was updated while the page was open), as opposed to a page that
 * threw while drawing. The two need different help: a draw error can be tried again, but a lazy
 * component remembers that its code failed, so only a full reload fetches it afresh.
 */
const CHUNK_ERROR = /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|loading (css )?chunk [\w-]+ failed|chunkloaderror/i

export function isChunkLoadError(error: unknown): boolean {
  if (error instanceof Error) return CHUNK_ERROR.test(`${error.name} ${error.message}`)
  return typeof error === 'string' && CHUNK_ERROR.test(error)
}
