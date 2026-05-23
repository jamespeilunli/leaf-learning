import { BookOpen, CheckCircle2, Loader2 } from 'lucide-react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'

import { useSessionStore } from '../store/useSessionStore'
import type { GraphNode } from '../types'

export function Phase2Node({ data }: NodeProps<{ node: GraphNode }>) {
  const { node } = data
  const streamingNodeIds = useSessionStore((state) => state.streamingNodeIds)
  const openNodeDetails = useSessionStore((state) => state.openNodeDetails)
  const isStreaming = streamingNodeIds.has(node.id)
  const sources = node.sources?.length ? node.sources : node.resource ? [node.resource] : []
  const isLearned = node.node_state === 'learned'

  return (
    <button
      className={[
        'group relative h-[188px] w-[320px] rounded-[8px] border p-4 text-left shadow-[0_18px_42px_rgba(15,23,42,0.16)] transition',
        'before:absolute before:inset-x-4 before:top-0 before:h-[3px] before:rounded-b-full before:content-[""]',
        isLearned
          ? 'border-emerald-300 bg-[linear-gradient(180deg,#f3fff8_0%,#dff8ea_100%)] before:bg-emerald-500 hover:border-emerald-500'
          : 'border-[#263445] bg-[linear-gradient(180deg,#fffdf8_0%,#edf3f5_100%)] before:bg-[var(--accent)] hover:border-[var(--accent)]',
      ].join(' ')}
      type="button"
      onClick={() => openNodeDetails(node.id)}
    >
      <Handle position={Position.Top} style={{ opacity: 0 }} type="target" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="line-clamp-2 text-[17px] font-bold leading-6 text-[var(--ink)]">{node.label}</div>
          <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-strong)]">
            {isLearned ? 'Learned module' : 'Active module'}
          </div>
        </div>
        {isStreaming ? (
          <Loader2 className="mt-1 h-5 w-5 shrink-0 animate-spin text-[var(--accent)]" />
        ) : isLearned ? (
          <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-emerald-600" />
        ) : (
          <BookOpen className="mt-1 h-5 w-5 shrink-0 text-[var(--accent)]" />
        )}
      </div>

      {node.description ? (
        <p className="mt-3 line-clamp-3 text-[13px] leading-5 text-[var(--muted)]">{node.description}</p>
      ) : null}

      <div className="mt-4 border-t border-dashed border-slate-300 pt-3">
        {sources.length ? (
          <div className="space-y-1.5">
            {sources.slice(0, 2).map((source) => (
              <div key={source.url} className="truncate text-[12px] font-semibold text-slate-700">
                {source.title}
              </div>
            ))}
            {sources.length > 2 ? (
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-strong)]">
                +{sources.length - 2} more sources
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="h-3 w-4/5 animate-pulse rounded bg-slate-200" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
          </div>
        )}
      </div>
      <Handle position={Position.Bottom} style={{ opacity: 0 }} type="source" />
    </button>
  )
}
