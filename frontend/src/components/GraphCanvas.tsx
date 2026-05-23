import { useCallback, useMemo, useState } from 'react'

import dagre from 'dagre'
import { ArrowLeft } from 'lucide-react'
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow'
import type { Edge as RFEdge, Node as RFNode } from 'reactflow'
import { Position } from 'reactflow'

import { useSessionStore } from '../store/useSessionStore'
import type { GraphNode as AppGraphNode } from '../types'
import { GrayedNode } from './GrayedNode'
import { Phase2Node } from './Phase2Node'

const nodeTypes = { phase2Node: Phase2Node, grayedNode: GrayedNode }

export interface GraphCanvasNodeData {
  node: AppGraphNode
  reportSize: (nodeId: string, width: number, height: number) => void
}

type LayoutNode = RFNode<GraphCanvasNodeData> & {
  width: number
  height: number
}

function getNodeDimensions(node: AppGraphNode): { width: number; height: number } {
  const lineEstimate = Math.ceil((node.explain_more_text?.length ?? node.description?.length ?? 0) / 52)

  if (node.node_state === 'grayed') {
    if (node.explain_more_text === '__known__') {
      return { width: 260, height: 110 }
    }
    if (node.explain_more_text) {
      return { width: 280, height: 320 + lineEstimate * 10 }
    }
    return { width: 280, height: 220 }
  }

  if (node.node_state === 'learned') {
    return { width: 300, height: 250 }
  }

  return { width: 300, height: 280 }
}

function getLayoutedElements(nodes: LayoutNode[], edges: RFEdge[]) {
  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: 'LR', align: 'UL', nodesep: 92, ranksep: 150, marginx: 56, marginy: 56 })

  nodes.forEach((node) => graph.setNode(node.id, { width: node.width, height: node.height }))
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target))
  dagre.layout(graph)

  return nodes.map((node) => {
    const { x, y } = graph.node(node.id)
    return {
      ...node,
      position: { x: x - node.width / 2, y: y - node.height / 2 },
      style: { width: node.width },
    }
  })
}

export function GraphCanvas() {
  const session = useSessionStore((state) => state.session)
  const [nodeSizes, setNodeSizes] = useState<Record<string, { width: number; height: number }>>({})
  const restartFlow = useSessionStore((state) => state.restartFlow)

  const graphNodes = useMemo(() => {
    if (!session) return []
    return Object.values(session.nodes).filter(
      (node) => node.phase === '2' || node.id === session.focus_node_id,
    )
  }, [session])

  const rfEdges = useMemo<RFEdge[]>(() => {
    if (!session) return []
    return session.edges.map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
      label: edge.label ?? undefined,
      style: { strokeWidth: 1, stroke: '#94a3b8' },
      labelStyle: { fill: '#64748b', fontSize: 11, fontWeight: 600 },
    }))
  }, [session])

  const reportSize = useCallback((nodeId: string, width: number, height: number) => {
    setNodeSizes((current) => {
      const roundedWidth = Math.ceil(width)
      const roundedHeight = Math.ceil(height)
      const previous = current[nodeId]

      if (previous && previous.width === roundedWidth && previous.height === roundedHeight) {
        return current
      }

      return {
        ...current,
        [nodeId]: { width: roundedWidth, height: roundedHeight },
      }
    })
  }, [])

  const rfNodes = useMemo<RFNode[]>(() => {
    const nodes: LayoutNode[] = graphNodes.map((node: AppGraphNode) => ({
      ...(nodeSizes[node.id] ?? getNodeDimensions(node)),
      id: node.id,
      type: node.node_state === 'grayed' ? 'grayedNode' : 'phase2Node',
      position: { x: 0, y: 0 },
      data: { node, reportSize },
      targetPosition: Position.Left,
      sourcePosition: Position.Right,
    }))
    return getLayoutedElements(nodes, rfEdges)
  }, [graphNodes, nodeSizes, reportSize, rfEdges])

  if (!session) return null
  const focusNode = session.focus_node_id ? session.nodes[session.focus_node_id] : null

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(191,91,44,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(34,197,94,0.1),transparent_26%),linear-gradient(180deg,#f8f4ec_0%,#eef3f8_100%)]">
      <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex items-start justify-between gap-4 px-4">
        <button
          aria-label="Back to start"
          className="pointer-events-auto inline-flex h-11 items-center gap-2 rounded-full border border-white/70 bg-white/92 px-4 text-sm font-semibold text-[var(--ink)] shadow-[0_14px_34px_rgba(15,23,42,0.14)] backdrop-blur transition hover:border-[var(--accent)] hover:text-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2"
          title="Back to start"
          type="button"
          onClick={restartFlow}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="pointer-events-auto max-w-[min(520px,calc(100vw-7rem))] rounded-full border border-white/70 bg-white/82 px-4 py-2 text-right shadow-[0_14px_34px_rgba(15,23,42,0.10)] backdrop-blur">
          <div className="truncate text-sm font-semibold text-[var(--ink)]">
            {focusNode?.label ?? session.root_topic}
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute left-5 top-20 z-20 max-w-md rounded-[24px] border border-white/70 bg-white/78 px-5 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.10)] backdrop-blur">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-strong)]">
          Phase II Roadmap
        </p>
        <h2 className="mt-1 font-serif-display text-[24px] leading-none text-[var(--ink)]">
          Build the chain one prerequisite at a time
        </h2>
        <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
          Read left to right. Use <span className="font-semibold text-[var(--ink)]">Know</span> to mark a topic as covered,{' '}
          <span className="font-semibold text-[var(--ink)]">Don&apos;t know</span> to branch deeper, and{' '}
          <span className="font-semibold text-[var(--ink)]">Explain more</span> when you need the boundary clarified first.
        </p>
      </div>
      <ReactFlow
        className="phase-two-flow"
        defaultEdgeOptions={{ type: 'smoothstep' }}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        nodesFocusable
        panOnScroll
      >
        <MiniMap
          pannable
          zoomable
          className="!rounded-[18px] !border !border-[var(--line)] !bg-white/90 !shadow-[0_12px_30px_rgba(15,23,42,0.12)]"
          maskColor="rgba(248, 250, 252, 0.75)"
          nodeColor={(node) => (node.type === 'grayedNode' ? '#cbd5e1' : '#bf5b2c')}
        />
        <Controls />
        <Background color="#dbe3ef" gap={18} size={1} />
      </ReactFlow>
    </div>
  )
}
