import type { NodeStatus } from '../../content/projectDetails/types'
import type { Completion } from './StatusMark'

/** A part of the architecture and a feature share one three-state vocabulary; this maps the part's words to it. */
export const COMPLETION: Record<NodeStatus, Completion> = { built: 'done', partial: 'partial', planned: 'planned' }

/** The less finished of two statuses: a connection is only as real as its weaker end. */
export function weaker(a: NodeStatus, b: NodeStatus): NodeStatus {
  const order: NodeStatus[] = ['planned', 'partial', 'built']
  return order[Math.min(order.indexOf(a), order.indexOf(b))]
}
