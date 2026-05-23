import { useMemo } from 'react'

import dagre from 'dagre'
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

  return (
    <div className="h-screen w-full bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.12),transparent_35%),linear-gradient(180deg,#f6f6f2_0%,#eef2f7_100%)]">
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
