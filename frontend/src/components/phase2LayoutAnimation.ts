export const ROADMAP_LAYOUT_ANIMATION_MS = 360

export const ROADMAP_LAYOUT_NODE_CLASS = 'roadmap-node-shell--moving'
export const ROADMAP_LAYOUT_EDGE_CLASS = 'roadmap-edge--layout'

export type LayoutPoint = { x: number; y: number }
export type LayoutSize = { width: number; height: number }
export type LayoutAnchor = { nodeId: string; center: LayoutPoint }
export type AnchoredLayoutNode = { position: LayoutPoint }

export function nodeCenter(position: LayoutPoint, size: LayoutSize): LayoutPoint {
  return {
    x: position.x + size.width / 2,
    y: position.y + size.height / 2,
  }
}

export function alignNodesToAnchor<TNode extends AnchoredLayoutNode>(
  nodes: TNode[],
  currentCenter: LayoutPoint,
  targetCenter: LayoutPoint,
): TNode[] {
  const deltaX = targetCenter.x - currentCenter.x
  const deltaY = targetCenter.y - currentCenter.y

  if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return nodes

  return nodes.map((node) => ({
    ...node,
    position: {
      x: node.position.x + deltaX,
      y: node.position.y + deltaY,
    },
  }))
}

export function shouldAnimateLayout(
  hasPreviousLayout: boolean,
  reducedMotion = false,
): boolean {
  return hasPreviousLayout && !reducedMotion
}

export function prefersReducedMotion(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
}
