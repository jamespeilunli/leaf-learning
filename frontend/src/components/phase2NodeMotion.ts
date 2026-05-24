import type { GraphNode } from '../types'

export type RoadmapNodeMotion = 'idle' | 'enter' | 'inactiveEnter' | 'exit' | 'learned'

export type RoadmapNodeMotionSnapshot = Pick<GraphNode, 'id' | 'node_state'>

export function toNodeMotionSnapshot(nodes: GraphNode[]): Map<string, RoadmapNodeMotionSnapshot> {
  return new Map(nodes.map((node) => [node.id, { id: node.id, node_state: node.node_state }]))
}

export function getRemovedNodeIds(
  previous: Map<string, RoadmapNodeMotionSnapshot>,
  current: GraphNode[],
): string[] {
  const currentIds = new Set(current.map((node) => node.id))
  return [...previous.keys()].filter((id) => !currentIds.has(id))
}

export function getRoadmapNodeMotion(
  previous: Map<string, RoadmapNodeMotionSnapshot>,
  current: GraphNode[],
  hasPreviousSnapshot: boolean,
): Map<string, RoadmapNodeMotion> {
  const motion = new Map<string, RoadmapNodeMotion>()

  for (const node of current) {
    const previousNode = previous.get(node.id)

    if (!hasPreviousSnapshot || !previousNode) {
      motion.set(
        node.id,
        hasPreviousSnapshot ? (node.node_state === 'grayed' ? 'inactiveEnter' : 'enter') : 'idle',
      )
      continue
    }

    if (previousNode.node_state !== 'learned' && node.node_state === 'learned') {
      motion.set(node.id, 'learned')
      continue
    }

    if (previousNode.node_state === 'grayed' && node.node_state !== 'grayed') {
      motion.set(node.id, 'enter')
      continue
    }

    motion.set(node.id, 'idle')
  }

  return motion
}
