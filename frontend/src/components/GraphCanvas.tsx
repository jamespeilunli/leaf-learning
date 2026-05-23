import { useMemo } from 'react'

import dagre from 'dagre'
import { ArrowLeft } from 'lucide-react'
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow'
import type { Edge as RFEdge, Node as RFNode } from 'reactflow'

import { useSessionStore } from '../store/useSessionStore'
import type { GraphNode as AppGraphNode } from '../types'
import { GrayedNode } from './GrayedNode'
import { Phase2Node } from './Phase2Node'

const nodeTypes = { phase2Node: Phase2Node, grayedNode: GrayedNode }

function getLayoutedElements(
  nodes: RFNode[],
  edges: RFEdge[],
  nodeWidth = 280,
  nodeHeight = 170,
) {
  const graph = new dagre.graphlib.Graph()
  graph.setDefaultEdgeLabel(() => ({}))
  graph.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 100 })

  nodes.forEach((node) => graph.setNode(node.id, { width: nodeWidth, height: nodeHeight }))
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target))
  dagre.layout(graph)

  return nodes.map((node) => {
    const { x, y } = graph.node(node.id)
    return {
      ...node,
      position: { x: x - nodeWidth / 2, y: y - nodeHeight / 2 },
    }
  })
}

export function GraphCanvas() {
  const session = useSessionStore((state) => state.session)
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

  const rfNodes = useMemo<RFNode[]>(() => {
    const nodes = graphNodes.map((node: AppGraphNode) => ({
      id: node.id,
      type: node.node_state === 'grayed' ? 'grayedNode' : 'phase2Node',
      position: { x: 0, y: 0 },
      data: { node },
    }))
    return getLayoutedElements(nodes, rfEdges)
  }, [graphNodes, rfEdges])

  if (!session) return null
  const focusNode = session.focus_node_id ? session.nodes[session.focus_node_id] : null

  return (
    <div className="h-screen w-full bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.12),transparent_35%),linear-gradient(180deg,#f6f6f2_0%,#eef2f7_100%)]">
      <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex items-start justify-between gap-4 px-4">
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
      <ReactFlow
        defaultEdgeOptions={{ type: 'smoothstep' }}
        fitView
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
      >
        <MiniMap pannable zoomable />
        <Controls />
        <Background color="#dbe3ef" gap={18} size={1} />
      </ReactFlow>
    </div>
  )
}
