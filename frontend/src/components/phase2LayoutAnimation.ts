export const ROADMAP_LAYOUT_ANIMATION_MS = 360

export const ROADMAP_LAYOUT_NODE_CLASS = 'roadmap-node-shell--moving'
export const ROADMAP_LAYOUT_EDGE_CLASS = 'roadmap-edge--layout'

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
