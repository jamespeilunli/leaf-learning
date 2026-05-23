import { Loader2 } from 'lucide-react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'

import { useSessionStore } from '../store/useSessionStore'
import type { GraphNode } from '../types'

export function GrayedNode({ data }: NodeProps<{ node: GraphNode }>) {
  const { node } = data
  const explainNode = useSessionStore((state) => state.explainNode)
  const expandNode = useSessionStore((state) => state.expandNode)
  const explainingNodeIds = useSessionStore((state) => state.explainingNodeIds)
  const streamingNodeIds = useSessionStore((state) => state.streamingNodeIds)
  const isExplaining = explainingNodeIds.has(node.id)
  const isExpanding = streamingNodeIds.has(node.id)

  return (
    <div className="min-w-[220px] rounded-[20px] border border-dashed border-[var(--line)] bg-white/70 p-4 opacity-70 shadow-[0_14px_26px_rgba(15,23,42,0.08)]">
      <Handle position={Position.Top} style={{ opacity: 0 }} type="target" />
      {node.explain_more_text === '__known__' ? (
        <div className="rounded-[16px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-emerald-700">
          ✓ Already learned
        </div>
      ) : null}
      <div className="mt-2 text-[15px] font-semibold text-[var(--ink)]">{node.label}</div>
      {node.description ? <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">{node.description}</p> : null}

      {node.explain_more_text && node.explain_more_text !== '__known__' ? (
        <div className="mt-3 rounded-[14px] border border-[var(--line)] bg-[var(--panel)] p-3 text-[13px] leading-6 text-[var(--muted)]">
          {node.explain_more_text}
        </div>
      ) : null}

      {node.explain_more_text === '__known__' ? null : (
        <div className="mt-4 flex items-center gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-2 text-xs font-semibold text-[var(--ink)] transition hover:border-[var(--accent)]"
            type="button"
            onClick={() => void explainNode(node.id)}
          >
            {isExplaining ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Explain more
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
      )}
      <Handle position={Position.Bottom} style={{ opacity: 0 }} type="source" />
    </div>
  )
}
