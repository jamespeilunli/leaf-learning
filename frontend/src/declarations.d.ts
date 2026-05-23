declare module 'dagre'

declare module 'react-force-graph-2d' {
  import type { ForwardRefExoticComponent, RefAttributes } from 'react'

  export interface ForceGraphMethods {
    centerAt: (x?: number, y?: number, ms?: number) => void
    d3Force: (forceName: string, force?: unknown) => unknown
    d3ReheatSimulation: () => void
    refresh: () => void
    zoom: (zoom?: number, ms?: number) => number | void
    zoomToFit: (ms?: number, padding?: number, nodeFilter?: (node: unknown) => boolean) => void
  }

  export interface ForceGraph2DProps {
    backgroundColor?: string
    autoPauseRedraw?: boolean
    cooldownTicks?: number
    enableNodeDrag?: boolean
    graphData: { nodes: unknown[]; links: unknown[] }
    height?: number
    linkColor?: (link: unknown) => string
    linkDirectionalParticles?: number | ((link: unknown) => number)
    linkDirectionalParticleSpeed?: number
    linkDirectionalParticleWidth?: number
    linkWidth?: (link: unknown) => number
    maxZoom?: number
    minZoom?: number
    nodeCanvasObject?: (node: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => void
    nodePointerAreaPaint?: (node: unknown, color: string, ctx: CanvasRenderingContext2D) => void
    onEngineStop?: () => void
    onEngineTick?: () => void
    onNodeClick?: (node: unknown) => void
    onNodeDragEnd?: (node: unknown) => void
    width?: number
  }

  const ForceGraph2D: ForwardRefExoticComponent<
    ForceGraph2DProps & RefAttributes<ForceGraphMethods>
  >
  export default ForceGraph2D
}
