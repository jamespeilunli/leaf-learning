import { useEffect, useMemo, useState } from 'react'

import { Network, Sparkles } from 'lucide-react'
import ReactFlow, { Background, Controls, MiniMap, ReactFlowProvider, useReactFlow } from 'reactflow'
import type { Edge as RFEdge, Node as RFNode, NodeMouseHandler } from 'reactflow'

import { useSessionStore } from '../store/useSessionStore'
import type { GraphNode } from '../types'
import { DeepDiveButton } from './DeepDiveButton'
import { Phase1KnowledgeNode } from './Phase1KnowledgeNode'
import { ResolutionPicker } from './ResolutionPicker'

const nodeTypes = { phase1KnowledgeNode: Phase1KnowledgeNode }
const NODE_WIDTH = 190
const NODE_HEIGHT = 94

function hashUnit(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) / 4294967295
}

function layoutKnowledgeWeb(nodes: GraphNode[], edges: RFEdge[]) {
  const ordered = [...nodes].sort((a, b) => a.depth - b.depth || a.label.localeCompare(b.label))
  const childIndex = new Map<string, number>()
  const childCount = new Map<string, number>()

  for (const node of ordered) {
    if (!node.parent_id) continue
    const count = childCount.get(node.parent_id) ?? 0
    childIndex.set(node.id, count)
    childCount.set(node.parent_id, count + 1)
  }

  const points = new Map<string, { x: number; y: number; vx: number; vy: number; depth: number }>()

  for (const node of ordered) {
    const parent = node.parent_id ? points.get(node.parent_id) : null
    if (!parent) {
      points.set(node.id, { x: 0, y: 0, vx: 0, vy: 0, depth: node.depth })
      continue
    }

    const siblings = Math.max(childCount.get(node.parent_id ?? '') ?? 1, 1)
    const index = childIndex.get(node.id) ?? 0
    const seed = hashUnit(node.id) - 0.5
    const spread = Math.PI * 1.35
    const baseAngle = -Math.PI / 2 + (index - (siblings - 1) / 2) * (spread / Math.max(siblings, 2))
    const angle = baseAngle + seed * 0.42
    const distance = 220 + node.depth * 24

    points.set(node.id, {
      x: parent.x + Math.cos(angle) * distance,
      y: parent.y + Math.sin(angle) * distance + 150,
      vx: 0,
      vy: 0,
      depth: node.depth,
    })
  }

  const springEdges = edges
    .map((edge) => ({ source: edge.source, target: edge.target }))
    .filter((edge) => points.has(edge.source) && points.has(edge.target))

  for (let tick = 0; tick < 180; tick += 1) {
    const values = [...points.entries()]

    for (let left = 0; left < values.length; left += 1) {
      for (let right = left + 1; right < values.length; right += 1) {
        const [, a] = values[left]
        const [, b] = values[right]
        const dx = b.x - a.x || 0.01
        const dy = b.y - a.y || 0.01
        const distanceSquared = Math.max(dx * dx + dy * dy, 900)
        const force = 9000 / distanceSquared
        const distance = Math.sqrt(distanceSquared)
        const fx = (dx / distance) * force
        const fy = (dy / distance) * force

        a.vx -= fx
        a.vy -= fy
        b.vx += fx
        b.vy += fy
      }
    }

    for (const edge of springEdges) {
      const source = points.get(edge.source)
      const target = points.get(edge.target)
      if (!source || !target) continue

      const dx = target.x - source.x || 0.01
      const dy = target.y - source.y || 0.01
      const distance = Math.sqrt(dx * dx + dy * dy)
      const desired = 235 + Math.min(target.depth, 4) * 18
      const force = (distance - desired) * 0.018
      const fx = (dx / distance) * force
      const fy = (dy / distance) * force

      source.vx += fx
      source.vy += fy
      target.vx -= fx
      target.vy -= fy
    }

    for (const [id, point] of points) {
      const isRoot = nodes.find((node) => node.id === id)?.parent_id === null
      const targetY = point.depth * 170
      point.vy += (targetY - point.y) * 0.004
      if (isRoot) {
        point.vx += (0 - point.x) * 0.04
        point.vy += (0 - point.y) * 0.04
      }

      point.vx *= 0.78
      point.vy *= 0.78
      point.x += point.vx
      point.y += point.vy
    }
  }

  return points
}

interface KnowledgeWebProps {
  edges: RFEdge[]
  nodes: RFNode[]
  onNodeClick: NodeMouseHandler
  onPaneClick: () => void
}

function KnowledgeWeb({ edges, nodes, onNodeClick, onPaneClick }: KnowledgeWebProps) {
  const { fitView } = useReactFlow()

  useEffect(() => {
    if (!nodes.length) return
    window.requestAnimationFrame(() => {
      void fitView({ duration: 350, padding: 0.22 })
    })
  }, [fitView, nodes.length])

  return (
    <ReactFlow
      defaultEdgeOptions={{ type: 'smoothstep' }}
      edges={edges}
      fitView
      fitViewOptions={{ padding: 0.22 }}
      nodes={nodes}
      nodesDraggable
      nodeTypes={nodeTypes}
      onNodeClick={onNodeClick}
      onPaneClick={onPaneClick}
    >
      <MiniMap maskColor="rgba(251,250,245,0.72)" nodeColor="#bf5b2c" pannable zoomable />
      <Controls />
      <Background color="#d8dee8" gap={22} size={1} />
    </ReactFlow>
  )
}

export function Phase1View() {
  const session = useSessionStore((state) => state.session)
  const isLoading = useSessionStore((state) => state.isLoading)
  const expandPhase1Topic = useSessionStore((state) => state.expandPhase1Topic)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [expandingNodeId, setExpandingNodeId] = useState<string | null>(null)

  const phase1Nodes = useMemo(() => {
    if (!session) return []
    return Object.values(session.nodes).filter((node) => node.phase === '1')
  }, [session])

  const graphEdges = useMemo<RFEdge[]>(() => {
    const nodeIds = new Set(phase1Nodes.map((node) => node.id))
    return phase1Nodes.flatMap((node) =>
      node.child_ids
        .filter((childId) => nodeIds.has(childId))
        .map((childId) => ({
          id: `${node.id}-${childId}`,
          source: node.id,
          target: childId,
          type: 'smoothstep',
          animated: true,
          style: { stroke: '#94a3b8', strokeWidth: 1.6 },
        })),
    )
  }, [phase1Nodes])

  const graphNodes = useMemo<RFNode[]>(() => {
    const positions = layoutKnowledgeWeb(phase1Nodes, graphEdges)

    return phase1Nodes.map((node) => {
      const point = positions.get(node.id) ?? { x: 0, y: 0 }
      return {
        id: node.id,
        type: 'phase1KnowledgeNode',
        position: { x: point.x - NODE_WIDTH / 2, y: point.y - NODE_HEIGHT / 2 },
        selected: node.id === selectedNodeId,
        data: {
          node,
          isRoot: node.parent_id === null,
          isExpanded: node.child_ids.length > 0,
        },
      }
    })
  }, [graphEdges, phase1Nodes, selectedNodeId])

  const selectedNode = selectedNodeId && session ? session.nodes[selectedNodeId] : null
  const hasExpanded = Boolean(selectedNode?.child_ids.length)

  const handleNodeClick: NodeMouseHandler = (_, node) => {
    setSelectedNodeId(node.id)
  }

  async function handleExpand() {
    if (!selectedNode || hasExpanded) return

    const nodeId = selectedNode.id
    setExpandingNodeId(nodeId)
    await expandPhase1Topic(nodeId)
    setSelectedNodeId(null)
    setExpandingNodeId(null)
  }

  if (!session) {
    return null
  }

  return (
    <main className="h-screen overflow-hidden bg-[var(--bg)] text-[var(--ink)]">
      <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="relative h-[62vh] min-h-[460px] overflow-hidden bg-[radial-gradient(circle_at_20%_18%,rgba(14,165,233,0.16),transparent_30%),radial-gradient(circle_at_80%_16%,rgba(191,91,44,0.14),transparent_28%),linear-gradient(180deg,#fbfaf5_0%,#eef2f6_100%)] lg:h-full">
          <div className="pointer-events-none absolute left-5 top-5 z-10 flex items-center gap-3 rounded-[8px] border border-white/70 bg-white/80 px-4 py-3 shadow-[0_16px_42px_rgba(24,33,45,0.12)] backdrop-blur">
            <div className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-[var(--ink)] text-white">
              <Network size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-[var(--muted)]">Web of Knowledge</p>
              <h1 className="font-serif-display text-2xl leading-7">{session.root_topic}</h1>
            </div>
          </div>

          <div className="absolute inset-0">
            <ReactFlowProvider>
              <KnowledgeWeb
                edges={graphEdges}
                nodes={graphNodes}
                onNodeClick={handleNodeClick}
                onPaneClick={() => setSelectedNodeId(null)}
              />
            </ReactFlowProvider>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col border-l border-[var(--line)] bg-[var(--paper)]">
          <div className="border-b border-[var(--line)] px-6 py-5">
            <p className="text-xs font-semibold uppercase text-[var(--muted)]">Phase 1</p>
            <h2 className="mt-1 font-serif-display text-3xl leading-9">Explore before you commit</h2>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {selectedNode ? (
              <div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[var(--accent-soft)] text-[var(--accent)]">
                    <Sparkles size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase text-[var(--muted)]">Selected topic</p>
                    <h3 className="mt-1 break-words text-2xl font-semibold leading-8">
                      {selectedNode.label}
                    </h3>
                  </div>
                </div>

                <div className="mt-6 space-y-5">
                  <section>
                    <h4 className="text-sm font-semibold text-[var(--ink)]">What it is</h4>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                      {selectedNode.description ?? 'This topic is ready to inspect or expand.'}
                    </p>
                  </section>

                  <section>
                    <h4 className="text-sm font-semibold text-[var(--ink)]">Why it is interesting</h4>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                      {selectedNode.why_interesting ??
                        'It can become a useful anchor for a more focused learning path.'}
                    </p>
                  </section>
                </div>

                <div className="mt-7 flex flex-col gap-3">
                  <button
                    className="rounded-[8px] border border-[var(--line)] bg-white px-4 py-3 text-sm font-semibold text-[var(--ink)] transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:bg-[var(--panel)] disabled:text-[var(--muted)]"
                    disabled={hasExpanded || isLoading}
                    type="button"
                    onClick={() => void handleExpand()}
                  >
                    {hasExpanded
                      ? 'Already expanded'
                      : expandingNodeId === selectedNode.id
                        ? 'Expanding...'
                        : 'Expand'}
                  </button>
                  <DeepDiveButton nodeId={selectedNode.id} />
                </div>
              </div>
            ) : (
              <div>
                <h3 className="text-xl font-semibold leading-7">Choose any node in the web.</h3>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  Click a topic to read what it covers, expand it into more specific branches, or
                  deep dive once it feels like the right direction.
                </p>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="rounded-[8px] border border-[var(--line)] bg-white p-4">
                    <div className="text-2xl font-semibold">{phase1Nodes.length}</div>
                    <div className="mt-1 text-xs font-medium text-[var(--muted)]">Topics mapped</div>
                  </div>
                  <div className="rounded-[8px] border border-[var(--line)] bg-white p-4">
                    <div className="text-2xl font-semibold">{graphEdges.length}</div>
                    <div className="mt-1 text-xs font-medium text-[var(--muted)]">Connections</div>
                  </div>
                </div>

                {isLoading ? (
                  <div className="mt-6 rounded-[8px] border border-[var(--line)] bg-white p-4 text-sm font-medium text-[var(--muted)]">
                    Expanding the web...
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="border-t border-[var(--line)] p-5">
            <ResolutionPicker compact />
          </div>
        </aside>
      </div>
    </main>
  )
}
