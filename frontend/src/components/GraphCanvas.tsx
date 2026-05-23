import { useCallback, useEffect, useMemo, useState } from 'react'

import { ArrowLeft } from 'lucide-react'
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow'
import type { Edge as RFEdge, Node as RFNode } from 'reactflow'
import { MarkerType, Position } from 'reactflow'
import type { ReactFlowInstance } from 'reactflow'

import { useSessionStore } from '../store/useSessionStore'
import type { GraphNode as AppGraphNode } from '../types'
import { CenterLineEdge } from './CenterLineEdge'
import { GrayedNode } from './GrayedNode'
import { Phase2FocusOverlay } from './Phase2FocusOverlay'
import { Phase2Node } from './Phase2Node'

const nodeTypes = { phase2Node: Phase2Node, grayedNode: GrayedNode }
const edgeTypes = { centerLine: CenterLineEdge }

export interface GraphCanvasNodeData {
  node: AppGraphNode
  reportSize: (nodeId: string, width: number, height: number) => void
}

interface CenterLineEdgeData {
  sourceCenter: { x: number; y: number }
  targetCenter: { x: number; y: number }
}

type LayoutNode = RFNode<GraphCanvasNodeData> & {
  width: number
  height: number
}

function getNodeDimensions(node: AppGraphNode): { width: number; height: number } {
  if (node.node_state === 'grayed') {
    return { width: 168, height: 112 }
  }

  return { width: 180, height: 112 }
}

function getLayoutedElements(nodes: LayoutNode[], edges: RFEdge[]) {
  const siblingGapBase = 36
  const siblingGapStep = 6
  const rootGap = 112
  const verticalGap = 104
  const horizontalMargin = 56
  const verticalMargin = 56
  const nodeMap = new Map(nodes.map((node) => [node.id, { ...node, style: { width: node.width, height: node.height } }]))
  const outgoing = new Map<string, string[]>()
  const incoming = new Set<string>()

  edges.forEach((edge) => {
    incoming.add(edge.target)
    const children = outgoing.get(edge.source) ?? []
    children.push(edge.target)
    outgoing.set(edge.source, children)
  })

  nodeMap.forEach((node) => {
    const orderedChildren = node.data.node.child_ids.filter((childId) => nodeMap.has(childId))
    if (orderedChildren.length > 0) {
      outgoing.set(node.id, orderedChildren)
    } else if (!outgoing.has(node.id)) {
      outgoing.set(node.id, [])
    }
  })

  const roots = [...nodeMap.values()]
    .filter((node) => !incoming.has(node.id))
    .sort((a, b) => a.data.node.depth - b.data.node.depth || a.data.node.label.localeCompare(b.data.node.label))

  const rootDepth = Math.min(...roots.map((node) => node.data.node.depth))

  const siblingGapForDepth = (depth: number) => siblingGapBase + Math.max(0, depth - rootDepth) * siblingGapStep

  const subtreeWidths = new Map<string, number>()
  const levelHeights = new Map<number, number>()

  const measureSubtree = (nodeId: string): number => {
    const node = nodeMap.get(nodeId)
    if (!node) return 0

    levelHeights.set(node.data.node.depth, Math.max(levelHeights.get(node.data.node.depth) ?? 0, node.height))
    const childIds = outgoing.get(nodeId) ?? []
    if (childIds.length === 0) {
      subtreeWidths.set(nodeId, node.width)
      return node.width
    }

    const siblingGap = siblingGapForDepth(node.data.node.depth + 1)
    const childrenWidth =
      childIds.reduce((total, childId) => total + measureSubtree(childId), 0) +
      Math.max(0, childIds.length - 1) * siblingGap
    const width = Math.max(node.width, childrenWidth)
    subtreeWidths.set(nodeId, width)
    return width
  }

  roots.forEach((root) => measureSubtree(root.id))

  const orderedDepths = [...levelHeights.keys()].sort((a, b) => a - b)
  const levelY = new Map<number, number>()
  let currentY = verticalMargin
  orderedDepths.forEach((depth) => {
    levelY.set(depth, currentY)
    currentY += (levelHeights.get(depth) ?? 0) + verticalGap
  })

  const placeSubtree = (nodeId: string, leftX: number) => {
    const node = nodeMap.get(nodeId)
    if (!node) return

    const subtreeWidth = subtreeWidths.get(nodeId) ?? node.width
    const nodeX = leftX + (subtreeWidth - node.width) / 2
    node.position = {
      x: nodeX,
      y: levelY.get(node.data.node.depth) ?? verticalMargin,
    }

    const childIds = outgoing.get(nodeId) ?? []
    if (childIds.length === 0) {
      return
    }

    const siblingGap = siblingGapForDepth(node.data.node.depth + 1)
    const childrenWidth =
      childIds.reduce((total, childId) => total + (subtreeWidths.get(childId) ?? 0), 0) +
      Math.max(0, childIds.length - 1) * siblingGap
    let childLeftX = leftX + (subtreeWidth - childrenWidth) / 2

    childIds.forEach((childId) => {
      placeSubtree(childId, childLeftX)
      childLeftX += (subtreeWidths.get(childId) ?? 0) + siblingGap
    })
  }

  const totalWidth =
    roots.reduce((total, root) => total + (subtreeWidths.get(root.id) ?? 0), 0) +
    Math.max(0, roots.length - 1) * rootGap
  let rootLeftX = horizontalMargin

  roots.forEach((root, index) => {
    placeSubtree(root.id, rootLeftX)
    rootLeftX += (subtreeWidths.get(root.id) ?? 0) + (index < roots.length - 1 ? rootGap : 0)
  })

  const positionedNodes = [...nodeMap.values()]
  const minX = Math.min(...positionedNodes.map((node) => node.position.x))
  const maxX = Math.max(...positionedNodes.map((node) => node.position.x + node.width))
  const minY = Math.min(...positionedNodes.map((node) => node.position.y))
  const centerOffsetX = horizontalMargin + totalWidth / 2 - (minX + maxX) / 2
  const topOffsetY = -minY + 56

  positionedNodes.forEach((node) => {
    node.position = {
      x: node.position.x + centerOffsetX,
      y: node.position.y + topOffsetY,
    }
  })

  return positionedNodes
}

export function GraphCanvas() {
  const session = useSessionStore((state) => state.session)
  const [nodeSizes, setNodeSizes] = useState<Record<string, { width: number; height: number }>>({})
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null)
  const restartFlow = useSessionStore((state) => state.restartFlow)

  const graphNodes = useMemo(() => {
    if (!session) return []
    return Object.values(session.nodes).filter(
      (node) => node.phase === '2' || node.id === session.focus_node_id,
    )
  }, [session])

  const baseEdges = useMemo<RFEdge[]>(() => {
    if (!session) return []
    return session.edges.map((edge) => ({
      id: edge.id,
      source: edge.from,
      target: edge.to,
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
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
    }))
    return getLayoutedElements(nodes, baseEdges)
  }, [baseEdges, graphNodes, nodeSizes, reportSize])

  const rfEdges = useMemo<RFEdge<CenterLineEdgeData>[]>(() => {
    if (!session) return []

    const nodeLookup = new Map(
      rfNodes.map((node) => [
        node.id,
        {
          x: node.position.x,
          y: node.position.y,
          width: Number(node.style?.width ?? 0),
          height: Number(node.style?.height ?? 0),
        },
      ]),
    )

    return session.edges.flatMap((edge) => {
      const sourceNode = nodeLookup.get(edge.from)
      const targetNode = nodeLookup.get(edge.to)
      if (!sourceNode || !targetNode) {
        return []
      }

      return [
        {
          id: edge.id,
          source: edge.from,
          target: edge.to,
          type: 'centerLine',
          animated: false,
          style: { strokeWidth: 2.25, stroke: '#94a3b8', strokeLinecap: 'round' },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
            color: '#94a3b8',
          },
          data: {
            sourceCenter: {
              x: sourceNode.x + sourceNode.width / 2,
              y: sourceNode.y + sourceNode.height / 2,
            },
            targetCenter: {
              x: targetNode.x + targetNode.width / 2,
              y: targetNode.y + targetNode.height / 2,
            },
          },
        },
      ]
    })
  }, [rfNodes, session])

  useEffect(() => {
    if (!session) {
      setFocusedNodeId(null)
      return
    }

    if (focusedNodeId && session.nodes[focusedNodeId]) {
      return
    }

    setFocusedNodeId(null)
  }, [focusedNodeId, session])

  const activeNodeId = focusedNodeId ?? session?.focus_node_id ?? null

  useEffect(() => {
    if (!flowInstance || !activeNodeId) {
      return
    }

    const activeNode = rfNodes.find((node) => node.id === activeNodeId)
    if (!activeNode) {
      return
    }

    const width = Number(activeNode.style?.width ?? 0)
    const height = Number(activeNode.style?.height ?? 0)
    flowInstance.setCenter(activeNode.position.x + width / 2, activeNode.position.y + height / 2, {
      duration: 320,
      zoom: Math.min(flowInstance.getZoom(), 1),
    })
  }, [activeNodeId, flowInstance, rfNodes])

  if (!session) return null
  const focusNode = session.focus_node_id ? session.nodes[session.focus_node_id] : null
  const focusedNode = focusedNodeId ? session.nodes[focusedNodeId] ?? null : null

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
          Follow the hierarchy from top to bottom
        </h2>
        <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
          Each row is a prerequisite depth. Follow the straight downward tree arrows, then click any node to focus it for
          `Know`, `Don&apos;t know`, `Explain more`, resources, and chat.
        </p>
      </div>
      <ReactFlow
        className="phase-two-flow"
        defaultEdgeOptions={{ type: 'centerLine' }}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
        nodes={rfNodes}
        edges={rfEdges}
        edgeTypes={edgeTypes}
        nodeTypes={nodeTypes}
        nodesFocusable
        onInit={setFlowInstance}
        onNodeClick={(_, node) => setFocusedNodeId(node.id)}
        onPaneClick={() => setFocusedNodeId(null)}
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
      {focusedNode ? <Phase2FocusOverlay node={focusedNode} onClose={() => setFocusedNodeId(null)} /> : null}
    </div>
  )
}
