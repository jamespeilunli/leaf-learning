import { useEffect, useMemo, useRef, useState } from 'react'
import type ELKConstructor from 'elkjs/lib/elk.bundled.js'

import { ArrowLeft } from 'lucide-react'
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow,
} from 'reactflow'
import type { Edge as RFEdge, Node as RFNode } from 'reactflow'

import { useSessionStore } from '../store/useSessionStore'
import type { GraphNode as AppGraphNode } from '../types'
import { GrayedNode } from './GrayedNode'
import { Phase2Node } from './Phase2Node'
import {
  ROADMAP_LAYOUT_ANIMATION_MS,
  ROADMAP_LAYOUT_EDGE_CLASS,
  ROADMAP_LAYOUT_NODE_CLASS,
  prefersReducedMotion,
  shouldAnimateLayout,
} from './phase2LayoutAnimation'
import {
  getRemovedNodeIds,
  getRoadmapNodeMotion,
  toNodeMotionSnapshot,
} from './phase2NodeMotion'
import type { RoadmapNodeMotion, RoadmapNodeMotionSnapshot } from './phase2NodeMotion'
import { Button, Eyebrow, StatusNotice } from './ui'

const nodeTypes = { phase2Node: Phase2Node, grayedNode: GrayedNode }
const ACTIVE_NODE = { width: 320, height: 188 }
const GRAYED_NODE = { width: 236, height: 132 }
const EXIT_ANIMATION_MS = 260
type ElkInstance = InstanceType<typeof ELKConstructor>
type RoadmapNodeData = {
  node: AppGraphNode
  motion: RoadmapNodeMotion
  motionKey: string
}

let elkPromise: Promise<ElkInstance> | null = null

async function getElk(): Promise<ElkInstance> {
  elkPromise ??= import('elkjs/lib/elk.bundled.js').then(({ default: ELK }) => new ELK())
  return elkPromise
}

function sizeForNode(node: AppGraphNode) {
  return node.node_state === 'grayed' ? GRAYED_NODE : ACTIVE_NODE
}

async function layoutTree(
  nodes: AppGraphNode[],
  edges: RFEdge[],
  motionByNodeId: Map<string, RoadmapNodeMotion>,
): Promise<RFNode<RoadmapNodeData>[]> {
  const elk = await getElk()
  const children = nodes.map((node) => {
    const size = sizeForNode(node)
    return {
      id: node.id,
      width: size.width,
      height: size.height,
    }
  })

  const graph = await elk.layout({
    id: 'phase-2-roadmap',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '52',
      'elk.layered.spacing.nodeNodeBetweenLayers': '110',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
    },
    children,
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  })

  const positions = new Map((graph.children ?? []).map((node) => [node.id, node]))
  return nodes.map((node) => {
    const position = positions.get(node.id)
    return {
      id: node.id,
      type: node.node_state === 'grayed' ? 'grayedNode' : 'phase2Node',
      position: { x: position?.x ?? 0, y: position?.y ?? 0 },
      data: {
        node,
        motion: motionByNodeId.get(node.id) ?? 'idle',
        motionKey: `${node.id}-${node.node_state}-${motionByNodeId.get(node.id) ?? 'idle'}`,
      },
    }
  })
}

function decorateEdgesForMotion(
  edges: RFEdge[],
  motionByNodeId: Map<string, RoadmapNodeMotion>,
  isLayoutMoving: boolean,
): RFEdge[] {
  const enteringNodeIds = new Set(
    [...motionByNodeId.entries()]
      .filter(([, motion]) => motion === 'enter' || motion === 'inactiveEnter')
      .map(([nodeId]) => nodeId),
  )

  return edges.map((edge) => {
    const classNames = [
      edge.className,
      isLayoutMoving && ROADMAP_LAYOUT_EDGE_CLASS,
      (enteringNodeIds.has(edge.source) || enteringNodeIds.has(edge.target)) &&
        'roadmap-edge--enter',
    ].filter(Boolean).join(' ')

    return {
      ...edge,
      className: classNames || undefined,
    }
  })
}

function decorateNodesForLayoutMotion(
  nodes: RFNode<RoadmapNodeData>[],
  previousNodes: RFNode<RoadmapNodeData>[],
  isLayoutMoving: boolean,
): RFNode<RoadmapNodeData>[] {
  if (!isLayoutMoving) return nodes

  const previousIds = new Set(previousNodes.map((node) => node.id))
  return nodes.map((node) => {
    if (!previousIds.has(node.id)) return node
    return {
      ...node,
      className: [node.className, ROADMAP_LAYOUT_NODE_CLASS].filter(Boolean).join(' '),
    }
  })
}

export function GraphCanvas() {
  const session = useSessionStore((state) => state.session)
  const restartFlow = useSessionStore((state) => state.restartFlow)
  const reactFlow = useReactFlow()
  const paneRef = useRef<HTMLDivElement | null>(null)
  const didInitialFit = useRef(false)
  const rfNodesRef = useRef<RFNode<RoadmapNodeData>[]>([])
  const nodeSnapshotRef = useRef<Map<string, RoadmapNodeMotionSnapshot> | null>(null)
  const [rfNodes, setRfNodes] = useState<RFNode<RoadmapNodeData>[]>([])
  const [rfEdges, setRfEdges] = useState<RFEdge[]>([])

  const graphNodes = useMemo(() => {
    if (!session) return []
    return Object.values(session.nodes).filter(
      (node) => (node.phase === '2' || node.id === session.focus_node_id) && node.is_visible,
    )
  }, [session])

  const baseRfEdges = useMemo<RFEdge[]>(() => {
    if (!session) return []
    return session.edges
      .filter((edge) => session.nodes[edge.from]?.is_visible && session.nodes[edge.to]?.is_visible)
      .map((edge) => ({
        id: edge.id,
        source: edge.to,
        target: edge.from,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#334155', width: 18, height: 18 },
        style: { strokeWidth: 1.6, stroke: '#334155' },
      }))
  }, [session])

  useEffect(() => {
    rfNodesRef.current = rfNodes
  }, [rfNodes])

  useEffect(() => {
    let cancelled = false
    let exitTimer: number | null = null
    let layoutTimer: number | null = null
    const previousSnapshot = nodeSnapshotRef.current ?? new Map<string, RoadmapNodeMotionSnapshot>()
    const hasPreviousSnapshot = nodeSnapshotRef.current !== null
    const currentSnapshot = toNodeMotionSnapshot(graphNodes)
    const removedNodeIds = hasPreviousSnapshot ? getRemovedNodeIds(previousSnapshot, graphNodes) : []
    const motionByNodeId = getRoadmapNodeMotion(previousSnapshot, graphNodes, hasPreviousSnapshot)
    const previousRfNodes = rfNodesRef.current
    const isLayoutMoving = shouldAnimateLayout(
      hasPreviousSnapshot && previousRfNodes.length > 0,
      prefersReducedMotion(),
    )
    const nextRfEdges = decorateEdgesForMotion(baseRfEdges, motionByNodeId, isLayoutMoving)

    nodeSnapshotRef.current = currentSnapshot

    void layoutTree(graphNodes, baseRfEdges, motionByNodeId).then((layouted) => {
      if (cancelled) return

      const exitingNodes = removedNodeIds.flatMap((nodeId) => {
        const previousNode = previousRfNodes.find((node) => node.id === nodeId)
        if (!previousNode) return []

        const previousData = previousNode.data
        return [
          {
            ...previousNode,
            data: {
              ...previousData,
              motion: 'exit' as const,
              motionKey: `${nodeId}-exit`,
            },
          },
        ]
      })

      const movingNodes = decorateNodesForLayoutMotion(layouted, previousRfNodes, isLayoutMoving)
      const targetNodes = [...movingNodes, ...exitingNodes]
      setRfEdges(nextRfEdges)
      setRfNodes(targetNodes)

      if (isLayoutMoving) {
        layoutTimer = window.setTimeout(() => {
          setRfNodes((current) =>
            current.map((node) => ({
              ...node,
              className: node.className
                ?.split(/\s+/)
                .filter((className) => className && className !== ROADMAP_LAYOUT_NODE_CLASS)
                .join(' ') || undefined,
            })),
          )
          setRfEdges((current) =>
            current.map((edge) => ({
              ...edge,
              className: edge.className
                ?.split(/\s+/)
                .filter((className) => className && className !== ROADMAP_LAYOUT_EDGE_CLASS)
                .join(' ') || undefined,
            })),
          )
        }, ROADMAP_LAYOUT_ANIMATION_MS)
      }

      if (exitingNodes.length) {
        const exitingNodeIds = new Set(exitingNodes.map((node) => node.id))
        exitTimer = window.setTimeout(() => {
          setRfNodes((current) => current.filter((node) => !exitingNodeIds.has(node.id)))
        }, EXIT_ANIMATION_MS)
      }
    })
    return () => {
      cancelled = true
      if (layoutTimer !== null) {
        window.clearTimeout(layoutTimer)
      }
      if (exitTimer !== null) {
        window.clearTimeout(exitTimer)
      }
    }
  }, [graphNodes, baseRfEdges])

  useEffect(() => {
    if (didInitialFit.current || !rfNodes.length) return
    const bounds = paneRef.current?.getBoundingClientRect()
    const width = bounds?.width ?? window.innerWidth
    const height = bounds?.height ?? window.innerHeight
    const viewport = getViewportForBounds(getNodesBounds(rfNodes), width, height, 0.18, 1.2, 0.22)
    reactFlow.setViewport(viewport)
    didInitialFit.current = true
  }, [reactFlow, rfNodes])

  if (!session) return null
  const focusNode = session.focus_node_id ? session.nodes[session.focus_node_id] : null

  return (
    <div ref={paneRef} className="h-screen w-full bg-[var(--panel)]">
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(23,33,23,0.05)_1px,transparent_1px),linear-gradient(180deg,rgba(23,33,23,0.05)_1px,transparent_1px)] bg-[size:34px_34px]" />
      <div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(183,95,49,0.12)_0%,rgba(237,241,236,0.38)_44%,rgba(36,117,141,0.13)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex items-start justify-between gap-4 px-4">
        <Button
          aria-label="Back to start"
          className="pointer-events-auto rounded-full border-white/70 bg-white/90 shadow-[0_14px_34px_rgba(15,23,42,0.14)] backdrop-blur"
          leftIcon={<ArrowLeft aria-hidden="true" className="h-4 w-4" />}
          size="sm"
          title="Back to start"
          type="button"
          variant="secondary"
          onClick={restartFlow}
        >
          Back
        </Button>
        <div className="pointer-events-auto max-w-[min(520px,calc(100vw-7rem))] rounded-[var(--radius-sm)] border border-white/70 bg-white/84 px-4 py-2 text-right shadow-[0_14px_34px_rgba(15,23,42,0.10)] backdrop-blur">
          <Eyebrow className="text-right">Roadmap focus</Eyebrow>
          <div className="truncate text-sm font-semibold text-[var(--ink)]">
            {focusNode?.label ?? session.root_topic}
          </div>
        </div>
      </div>
      {!rfNodes.length ? (
        <div className="pointer-events-none absolute inset-0 z-[5] grid place-items-center px-4">
          <StatusNotice className="max-w-sm bg-white/84 text-center shadow-[var(--shadow-soft)]" tone="loading">
            Laying out the roadmap...
          </StatusNotice>
        </div>
      ) : null}
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        proOptions={{ hideAttribution: true }}
      >
        <MiniMap
          pannable
          zoomable
          nodeColor={(node) => {
            const roadmapNode = node.data?.node as AppGraphNode | undefined
            if (roadmapNode?.node_state === 'learned') return '#10b981'
            if (roadmapNode?.node_state === 'grayed') return '#94a3b8'
            return '#bf5b2c'
          }}
        />
        <Controls />
        <Background color="#cbd5dc" gap={34} size={1} />
      </ReactFlow>
    </div>
  )
}
