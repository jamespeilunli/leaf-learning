import { useEffect, useRef } from 'react'

import { Check, X } from 'lucide-react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'

import { useSessionStore } from '../store/useSessionStore'
import type { GraphCanvasNodeData } from './GraphCanvas'

export function GrayedNode({ data }: NodeProps<GraphCanvasNodeData>) {
  const { node, reportSize } = data
  const containerRef = useRef<HTMLDivElement | null>(null)
  const markLearned = useSessionStore((state) => state.markLearned)
  const expandNode = useSessionStore((state) => state.expandNode)
  const streamingNodeIds = useSessionStore((state) => state.streamingNodeIds)
  const isExpanding = streamingNodeIds.has(node.id)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateSize = () => reportSize(node.id, element.offsetWidth, element.offsetHeight)
    updateSize()

    const observer = new ResizeObserver(() => updateSize())
    observer.observe(element)

    return () => observer.disconnect()
  }, [node.id, reportSize, node.label, node.explain_more_text])

  return (
    <div
      ref={containerRef}
      aria-label={node.label}
      className="relative min-h-[112px] min-w-[168px] max-w-[168px] rounded-[24px] border border-dashed border-[var(--line)] bg-white/84 p-4 shadow-[0_18px_34px_rgba(15,23,42,0.08)] outline-none backdrop-blur transition hover:border-[var(--accent)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[color:rgba(191,91,44,0.16)]"
      tabIndex={0}
    >
      <Handle position={Position.Left} style={{ opacity: 0 }} type="target" />
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5">
        <button
          aria-label={`Mark ${node.label} known`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line)] bg-white/90 text-[var(--muted-strong)] shadow-sm transition hover:border-emerald-300 hover:text-emerald-700"
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            void markLearned(node.id)
          }}
        >
          <Check className="h-4 w-4" />
        </button>
        <button
          aria-label={`Mark ${node.label} unknown`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line)] bg-white/90 text-[var(--muted-strong)] shadow-sm transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            void expandNode(node.id)
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex h-full flex-col justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-strong)]">
          {isExpanding ? 'Expanding' : node.explain_more_text === '__known__' ? 'Known' : 'Prerequisite'}
        </p>
        <div className="mt-3 text-[15px] font-semibold leading-6 text-[var(--ink)]">{node.label}</div>
      </div>
      <Handle position={Position.Right} style={{ opacity: 0 }} type="source" />
    </div>
  )
}
