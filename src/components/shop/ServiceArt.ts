import type { ArtKind } from '../home/BuildArt'
import type { ServiceId } from '../../content/services/ids'

/** Which drawing each service gets: the home page's own, plus one for implementing a design. */
export const SERVICE_ART: Record<ServiceId, ArtKind> = {
  website: 'websites',
  webapp: 'webapps',
  ui: 'ui',
  integrations: 'integrations',
}
