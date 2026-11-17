/**
 * Why a backup failed, as a word from a fixed list and (when the destination answered) its HTTP status. The message is a fixed sentence
 * chosen by the category: what the destination or the network said is read, checked and dropped, so an error can be logged, stored and
 * e-mailed to the owner without carrying a credential, a token or an answer's text.
 */

export type BackupErrorCategory =
  /** The destination refused the credentials (the token request). */
  | 'drive_auth'
  /** The destination answered with an error status. */
  | 'drive_http'
  | 'drive_network'
  /** What was stored is not what was sent (size or checksum). */
  | 'integrity'
  /** The database snapshot could not be made or read. */
  | 'snapshot'
  | 'encryption'
  /** Another backup is already running. */
  | 'busy'
  | 'internal'

export class BackupError extends Error {
  readonly category: BackupErrorCategory
  readonly httpStatus: number | null
  constructor(category: BackupErrorCategory, httpStatus: number | null = null) {
    super(
      category === 'drive_auth' || category === 'drive_http'
        ? `Google Drive HTTP ${httpStatus ?? 0}`
        : category === 'drive_network'
          ? 'Google Drive could not be reached'
          : category === 'integrity'
            ? 'Google Drive reported a different size or checksum than was sent'
            : category === 'snapshot'
              ? 'The database snapshot could not be made'
              : category === 'encryption'
                ? 'The backup could not be encrypted'
                : category === 'busy'
                  ? 'A backup is already running'
                  : 'The backup failed unexpectedly',
    )
    this.name = 'BackupError'
    this.category = category
    this.httpStatus = httpStatus
  }
}
