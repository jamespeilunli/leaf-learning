import { useEffect, useRef } from 'react'

import { Loader2 } from 'lucide-react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'

import { useSessionStore } from '../store/useSessionStore'
import type { GraphCanvasNodeData } from './GraphCanvas'

export function GrayedNode({ data }: NodeProps<GraphCanvasNodeData>) {
  const { node, reportSize } = data
  const explainNode = useSessionStore((state) => state.explainNode)
  const expandNode = useSessionStore((state) => state.expandNode)
  const markLearned = useSessionStore((state) => state.markLearned)
  const explainingNodeIds = useSessionStore((state) => state.explainingNodeIds)
  const streamingNodeIds = useSessionStore((state) => state.streamingNodeIds)
  const isExplaining = explainingNodeIds.has(node.id)
  const isExpanding = streamingNodeIds.has(node.id)
  const hasExplanation = Boolean(node.explain_more_text && node.explain_more_text !== '__known__')
  const showDecisionButtons = hasExplanation && !isExplaining
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateSize = () => reportSize(node.id, element.offsetWidth, element.offsetHeight)
    updateSize()

    const observer = new ResizeObserver(() => updateSize())
    observer.observe(element)

    return () => observer.disconnect()
  }, [node.id, reportSize, node.description, node.explain_more_text, node.node_state, isExplaining, isExpanding])

  return (
    <div
      ref={containerRef}
      aria-label={node.label}
      className="min-w-[220px] max-w-[260px] rounded-[24px] border border-dashed border-[var(--line)] bg-white/80 p-4 shadow-[0_18px_34px_rgba(15,23,42,0.08)] outline-none backdrop-blur transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[color:rgba(191,91,44,0.16)]"
      tabIndex={0}
    >
      <Handle position={Position.Left} style={{ opacity: 0 }} type="target" />
      {node.explain_more_text === '__known__' ? (
        <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
          ✓ Already learned
        </div>
      ) : (
        <>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-strong)]">
            Prerequisite check
          </p>
          <div className="mt-2 rounded-[20px] border border-[var(--line)] bg-[linear-gradient(180deg,rgba(255,255,255,0.95)_0%,rgba(244,246,249,0.95)_100%)] p-3">
            <div className="text-[15px] font-semibold text-[var(--ink)]">{node.label}</div>
            {node.description ? (
              <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">{node.description}</p>
            ) : null}
          </div>

          {isExplaining ? (
            <div className="mt-3 rounded-[18px] border border-[var(--line)] bg-[var(--panel)] p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-strong)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Mapping the knowledge boundary
              </div>
              <div className="mt-3 space-y-2">
                <div className="h-3 animate-pulse rounded bg-white" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-white" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-white" />
              </div>
            </div>
          ) : null}

          {hasExplanation ? (
            <div className="mt-3 rounded-[18px] border border-[var(--line)] bg-[var(--panel)] p-3 text-[13px] leading-6 text-[var(--muted)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-strong)]">
                What you need to know
              </p>
              <p className="mt-2">{node.explain_more_text}</p>
            </div>
          ) : null}

          {!hasExplanation && !isExplaining ? (
            <div className="mt-4 flex items-center gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]"
                type="button"
                onClick={() => void markLearned(node.id)}
              >
                Know
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-3 py-2 text-xs font-semibold text-[var(--paper)] transition hover:bg-[var(--accent)]"
                type="button"
                onClick={() => void expandNode(node.id)}
              >
                {isExpanding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Don&apos;t know
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]"
                type="button"
                onClick={() => void explainNode(node.id)}
              >
                Explain more
              </button>
            </div>
          ) : null}

          {showDecisionButtons ? (
            <div className="mt-4 flex items-center gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]"
                type="button"
                onClick={() => void markLearned(node.id)}
              >
                Know
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-3 py-2 text-xs font-semibold text-[var(--paper)] transition hover:bg-[var(--accent)]"
                type="button"
                onClick={() => void expandNode(node.id)}
              >
                {isExpanding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Don&apos;t know
              </button>
            </div>
          ) : null}
        </>
      )}
      <Handle position={Position.Right} style={{ opacity: 0 }} type="source" />
    </div>
  )
}
