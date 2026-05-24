import { useEffect, useMemo, useRef, useState } from 'react'

import { ArrowLeft, Loader2, Network, Sparkles } from 'lucide-react'
import ForceGraph2D from 'react-force-graph-2d'
import type { ForceGraphMethods } from 'react-force-graph-2d'

import { useSessionStore } from '../store/useSessionStore'
import type { GraphNode } from '../types'
import { DeepDiveButton } from './DeepDiveButton'
import { wrapCanvasText } from './phase1CanvasText'
import { Button, Eyebrow, Panel, StatusNotice } from './ui'

type TopicNode = GraphNode & {
  color: string
  isExpanded: boolean
  isNew?: boolean
  isRoot: boolean
  val: number
  fx?: number
  fy?: number
  vx?: number
  vy?: number
  x?: number
  y?: number
}

interface TopicLink {
  source: string | TopicNode
  target: string | TopicNode
}

interface TopicGraphData {
  links: TopicLink[]
  nodes: TopicNode[]
}

interface GraphSize {
  height: number
  width: number
}

const ROOT_COLOR = '#bf5b2c'
const EXPANDED_COLOR = '#15803d'
const READY_COLOR = '#0ea5e9'
const SELECTED_COLOR = '#18212d'
const ROOT_NODE_WIDTH = 188
const ROOT_NODE_HEIGHT = 82
const TOPIC_NODE_WIDTH = 168
const TOPIC_NODE_HEIGHT = 72

function getNodeColor(node: GraphNode, selectedNodeId: string | null) {
  if (node.id === selectedNodeId) return SELECTED_COLOR
  if (!node.parent_id) return ROOT_COLOR
  if (node.child_ids.length) return EXPANDED_COLOR
  return READY_COLOR
}

function getNodeEndpoint(endpoint: string | TopicNode) {
  return typeof endpoint === 'string' ? endpoint : endpoint.id
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function drawTopicNode(
  node: TopicNode,
  ctx: CanvasRenderingContext2D,
  globalScale: number,
  selectedNodeId: string | null,
) {
  const x = node.x ?? 0
  const y = node.y ?? 0
  const width = node.isRoot ? ROOT_NODE_WIDTH : TOPIC_NODE_WIDTH
  const height = node.isRoot ? ROOT_NODE_HEIGHT : TOPIC_NODE_HEIGHT
  const radius = 8
  const selected = node.id === selectedNodeId
  const fontSize = Math.max(9, 13 / Math.sqrt(globalScale))
  const labelMaxWidth = width - 38
  const labelMaxLines = node.isRoot ? 3 : 2

  if (node.isNew) {
    ctx.beginPath()
    ctx.arc(x, y, Math.max(width, height) * 0.62, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(14,165,233,0.11)'
    ctx.fill()
  }

  roundRect(ctx, x - width / 2, y - height / 2, width, height, radius)
  ctx.fillStyle = 'rgba(255,255,255,0.96)'
  ctx.fill()
  ctx.lineWidth = selected ? 3 : 1.5
  ctx.strokeStyle = selected ? ROOT_COLOR : 'rgba(148,163,184,0.7)'
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(x - width / 2 + 17, y - height / 2 + 18, 5.5, 0, Math.PI * 2)
  ctx.fillStyle = node.color
  ctx.fill()

  ctx.fillStyle = '#18212d'
  ctx.font = `600 ${fontSize}px Avenir Next, Segoe UI, sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  const labelLines = wrapCanvasText(ctx, node.label, labelMaxWidth, labelMaxLines)

  labelLines.forEach((line, index) => {
    ctx.fillText(line, x - width / 2 + 30, y - height / 2 + 12 + index * (fontSize + 3))
  })

  ctx.fillStyle = '#5d6773'
  ctx.font = `500 ${Math.max(8, 10 / Math.sqrt(globalScale))}px Avenir Next, Segoe UI, sans-serif`
  ctx.fillText(
    node.isRoot ? 'Root topic' : node.isExpanded ? 'Expanded' : 'Ready to expand',
    x - width / 2 + 30,
    y + height / 2 - 20,
  )
}

function keepGraphInBounds(nodes: TopicNode[]) {
  const maxRadius = Math.max(520, Math.sqrt(nodes.length) * 175)

  for (const node of nodes) {
    if (!Number.isFinite(node.x)) node.x = 0
    if (!Number.isFinite(node.y)) node.y = 0

    if (node.isRoot && node.fx === undefined && node.fy === undefined) {
      node.vx = (node.vx ?? 0) + (0 - (node.x ?? 0)) * 0.012
      node.vy = (node.vy ?? 0) + (0 - (node.y ?? 0)) * 0.012
    }

    const x = node.x ?? 0
    const y = node.y ?? 0
    const distance = Math.hypot(x, y)
    if (distance <= maxRadius) continue

    const excess = distance - maxRadius
    node.vx = (node.vx ?? 0) - (x / distance) * excess * 0.045
    node.vy = (node.vy ?? 0) - (y / distance) * excess * 0.045
  }
}

function useGraphSize() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<GraphSize>({ height: 620, width: 900 })

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const observer = new ResizeObserver(([entry]) => {
      setSize({
        height: Math.max(420, entry.contentRect.height),
        width: Math.max(320, entry.contentRect.width),
      })
    })
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  return { containerRef, size }
}

export function Phase1View() {
  const session = useSessionStore((state) => state.session)
  const isLoading = useSessionStore((state) => state.isLoading)
  const expandPhase1Topic = useSessionStore((state) => state.expandPhase1Topic)
  const restartFlow = useSessionStore((state) => state.restartFlow)
  const error = useSessionStore((state) => state.error)
  const graphRef = useRef<ForceGraphMethods | null>(null)
  const nodeCacheRef = useRef<Map<string, TopicNode>>(new Map())
  const previousNodeIdsRef = useRef<Set<string>>(new Set())
  const focusAfterExpandRef = useRef<string | null>(null)
  const { containerRef, size } = useGraphSize()
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [expandingNodeId, setExpandingNodeId] = useState<string | null>(null)
  const [newNodeIds, setNewNodeIds] = useState<Set<string>>(new Set())
  const [graphData, setGraphData] = useState<TopicGraphData>({ links: [], nodes: [] })

  const phase1Nodes = useMemo(() => {
    if (!session) return []
    return Object.values(session.nodes).filter((node) => node.phase === '1')
  }, [session])

  useEffect(() => {
    const currentIds = new Set(phase1Nodes.map((node) => node.id))
    const addedIds = [...currentIds].filter((id) => !previousNodeIdsRef.current.has(id))

    previousNodeIdsRef.current = currentIds
    if (!addedIds.length) return

    setNewNodeIds(new Set(addedIds))
    const timeout = window.setTimeout(() => setNewNodeIds(new Set()), 1400)
    return () => window.clearTimeout(timeout)
  }, [phase1Nodes])

  useEffect(() => {
    const cache = nodeCacheRef.current
    const currentIds = new Set(phase1Nodes.map((node) => node.id))

    for (const id of cache.keys()) {
      if (!currentIds.has(id)) cache.delete(id)
    }

    const nodes = phase1Nodes.map((node) => {
      const cached = cache.get(node.id)
      const parent = node.parent_id ? cache.get(node.parent_id) : null
      const seededAngle = (node.depth + cache.size + 1) * 1.73
      const topicNode: TopicNode = cached ?? {
        ...node,
        color: getNodeColor(node, selectedNodeId),
        isExpanded: node.child_ids.length > 0,
        isNew: newNodeIds.has(node.id),
        isRoot: node.parent_id === null,
        val: node.parent_id ? 10 : 14,
        vx: Math.cos(seededAngle) * 1.4,
        vy: Math.sin(seededAngle) * 1.4,
        x: parent?.x !== undefined ? parent.x + Math.cos(seededAngle) * 34 : undefined,
        y: parent?.y !== undefined ? parent.y + Math.sin(seededAngle) * 34 : undefined,
      }

      Object.assign(topicNode, {
        ...node,
        color: getNodeColor(node, selectedNodeId),
        isExpanded: node.child_ids.length > 0,
        isNew: newNodeIds.has(node.id),
        isRoot: node.parent_id === null,
        val: node.parent_id ? 10 : 14,
      })

      cache.set(node.id, topicNode)
      return topicNode
    })

    const nodeIds = new Set(nodes.map((node) => node.id))
    const links = phase1Nodes.flatMap((node) =>
      node.child_ids
        .filter((childId) => nodeIds.has(childId))
        .map((childId) => ({ source: node.id, target: childId })),
    )

    setGraphData({ links, nodes })
  }, [newNodeIds, phase1Nodes, selectedNodeId])

  const selectedNode = selectedNodeId && session ? session.nodes[selectedNodeId] : null
  const hasExpanded = Boolean(selectedNode?.child_ids.length)

  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return

    const charge = graph.d3Force('charge') as { strength?: (strength: number) => void } | undefined
    const link = graph.d3Force('link') as
      | { distance?: (distance: number) => void; strength?: (strength: number) => void }
      | undefined

    charge?.strength?.(-620)
    link?.distance?.(210)
    link?.strength?.(0.05)
    graph.d3ReheatSimulation()
  }, [graphData.nodes.length])

  useEffect(() => {
    if (!graphRef.current || !graphData.nodes.length) return

    const focusId = focusAfterExpandRef.current ?? selectedNodeId
    const focusNode = focusId ? nodeCacheRef.current.get(focusId) : null

    if (focusNode?.x !== undefined && focusNode.y !== undefined) {
      graphRef.current.centerAt(focusNode.x, focusNode.y, 520)
      graphRef.current.zoom(Math.max(0.42, Math.min(1.08, 1.42 - graphData.nodes.length * 0.035)), 520)
      focusAfterExpandRef.current = null
      return
    }

    if (phase1Nodes.length <= 7) {
      window.setTimeout(() => graphRef.current?.zoomToFit(450, 80), 260)
    }
  }, [graphData.nodes.length, phase1Nodes.length, selectedNodeId])

  useEffect(() => {
    if (!newNodeIds.size) return

    let frame = 0
    let active = true
    const redraw = () => {
      if (!active) return
      graphRef.current?.refresh()
      frame += 1
      if (frame < 84) window.requestAnimationFrame(redraw)
    }
    window.requestAnimationFrame(redraw)

    return () => {
      active = false
    }
  }, [newNodeIds])

  async function handleExpand() {
    if (!selectedNode || hasExpanded) return

    const nodeId = selectedNode.id
    focusAfterExpandRef.current = nodeId
    setExpandingNodeId(nodeId)
    await expandPhase1Topic(nodeId)
    setSelectedNodeId(null)
    setExpandingNodeId(null)
    graphRef.current?.d3ReheatSimulation()
  }

  if (!session) {
    return null
  }

  return (
    <main className="min-h-screen overflow-y-auto bg-[var(--bg)] text-[var(--ink)] lg:h-screen lg:overflow-hidden">
      <div className="grid min-h-screen lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_400px]">
        <section
          ref={containerRef}
          className="relative h-[58svh] min-h-[430px] overflow-hidden bg-[linear-gradient(135deg,rgba(255,253,247,0.96)_0%,rgba(237,241,236,0.98)_62%,rgba(220,236,240,0.62)_100%)] lg:h-full"
        >
          <div className="pointer-events-none absolute left-4 right-4 top-4 z-10 flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3 rounded-[var(--radius-sm)] border border-white/75 bg-white/84 px-4 py-3 shadow-[0_16px_42px_rgba(24,33,45,0.12)] backdrop-blur">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--ink)] text-white">
                <Network aria-hidden="true" size={18} />
              </div>
              <div className="min-w-0">
                <Eyebrow>Web of knowledge</Eyebrow>
                <h1 className="max-w-[62vw] truncate font-serif-display text-2xl leading-7 lg:max-w-[44vw]">
                  {session.root_topic}
                </h1>
              </div>
            </div>
            <div className="pointer-events-auto flex items-center gap-2">
              {isLoading ? (
                <div className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-sm)] border border-white/70 bg-white/82 px-3 text-sm font-semibold text-[var(--muted-strong)] shadow-sm backdrop-blur">
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  Mapping
                </div>
              ) : null}
              <Button
                leftIcon={<ArrowLeft aria-hidden="true" className="h-4 w-4" />}
                size="sm"
                variant="secondary"
                onClick={restartFlow}
              >
                Start
              </Button>
            </div>
          </div>

          <ForceGraph2D
            ref={graphRef}
            autoPauseRedraw={false}
            backgroundColor="rgba(0,0,0,0)"
            cooldownTicks={Infinity}
            enableNodeDrag
            graphData={graphData}
            height={size.height}
            linkColor={() => 'rgba(100,116,139,0.52)'}
            linkDirectionalParticles={(link) =>
              newNodeIds.has(getNodeEndpoint((link as TopicLink).target)) ? 2 : 0
            }
            linkDirectionalParticleSpeed={0.006}
            linkDirectionalParticleWidth={2}
            linkWidth={() => 1.4}
            maxZoom={2.2}
            minZoom={0.24}
            nodeCanvasObject={(node, ctx, globalScale) =>
              drawTopicNode(node as TopicNode, ctx, globalScale, selectedNodeId)
            }
            nodePointerAreaPaint={(node, color, ctx) => {
              const topicNode = node as TopicNode
              const width = topicNode.isRoot ? ROOT_NODE_WIDTH : TOPIC_NODE_WIDTH
              const height = topicNode.isRoot ? ROOT_NODE_HEIGHT : TOPIC_NODE_HEIGHT
              ctx.fillStyle = color
              ctx.fillRect((topicNode.x ?? 0) - width / 2, (topicNode.y ?? 0) - height / 2, width, height)
            }}
            onEngineTick={() => keepGraphInBounds(graphData.nodes)}
            onNodeClick={(node) => setSelectedNodeId((node as TopicNode).id)}
            onNodeDragEnd={(node) => {
              const topicNode = node as TopicNode
              topicNode.fx = topicNode.x
              topicNode.fy = topicNode.y
            }}
            width={size.width}
          />
        </section>

        <aside className="flex min-h-[42svh] flex-col border-t border-[var(--line)] bg-[var(--paper)] lg:min-h-0 lg:border-l lg:border-t-0">
          <div className="border-b border-[var(--line)] px-6 py-5">
            <Eyebrow>Phase 1</Eyebrow>
            <h2 className="mt-1 font-serif-display text-3xl leading-9">Explore before you commit</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Select a node to inspect it, expand promising directions, or enter the roadmap view.
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {error ? <StatusNotice className="mb-5" tone="error">{error}</StatusNotice> : null}
            {selectedNode ? (
              <div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent-soft)] text-[var(--accent)]">
                    <Sparkles aria-hidden="true" size={18} />
                  </div>
                  <div className="min-w-0">
                    <Eyebrow>Selected topic</Eyebrow>
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
                  <Button
                    disabled={hasExpanded || isLoading}
                    isLoading={expandingNodeId === selectedNode.id}
                    type="button"
                    variant="secondary"
                    onClick={() => void handleExpand()}
                  >
                    {hasExpanded
                      ? 'Already expanded'
                      : expandingNodeId === selectedNode.id
                        ? 'Expanding...'
                        : 'Expand'}
                  </Button>
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
                  <Panel className="p-4 shadow-none">
                    <div className="text-2xl font-semibold">{phase1Nodes.length}</div>
                    <div className="mt-1 text-xs font-medium text-[var(--muted)]">Topics mapped</div>
                  </Panel>
                  <Panel className="p-4 shadow-none">
                    <div className="text-2xl font-semibold">{graphData.links.length}</div>
                    <div className="mt-1 text-xs font-medium text-[var(--muted)]">Connections</div>
                  </Panel>
                </div>

                {isLoading ? (
                  <StatusNotice className="mt-6" tone="loading">
                    Expanding the web...
                  </StatusNotice>
                ) : null}
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  )
}
