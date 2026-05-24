import { BookOpen, CheckCircle2, Loader2 } from 'lucide-react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'

import { useSessionStore } from '../store/useSessionStore'
import type { GraphNode } from '../types'
import { cn } from '../lib/cn'
import { SkeletonLines } from './ui'

export function Phase2Node({ data }: NodeProps<{ node: GraphNode }>) {
  const { node } = data
  const streamingNodeIds = useSessionStore((state) => state.streamingNodeIds)
  const openNodeDetails = useSessionStore((state) => state.openNodeDetails)
  const isStreaming = streamingNodeIds.has(node.id)
  const sources = node.sources?.length ? node.sources : node.resource ? [node.resource] : []
  const visibleSources = sources.slice(0, 2)
  const hiddenSourceCount = Math.max(0, sources.length - visibleSources.length)
  const isLearned = node.node_state === 'learned'

  return (
    <button
      className={[
        'group relative h-[188px] w-[320px] overflow-hidden rounded-[var(--radius-sm)] border p-4 text-left shadow-[0_18px_42px_rgba(15,23,42,0.14)] transition duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2',
        'before:absolute before:inset-x-4 before:top-0 before:h-[3px] before:rounded-b-full before:content-[""]',
        isLearned
          ? 'border-[var(--success)]/35 bg-[linear-gradient(180deg,#f5fff9_0%,#e2f4e9_100%)] before:bg-[var(--success)] hover:border-[var(--success)]'
          : 'border-[var(--ink-soft)] bg-[linear-gradient(180deg,#fffdf7_0%,#edf1ec_100%)] before:bg-[var(--accent)] hover:border-[var(--accent)] hover:shadow-[0_22px_52px_rgba(23,33,23,0.18)]',
      ].join(' ')}
      type="button"
      onClick={() => openNodeDetails(node.id)}
    >
      <Handle position={Position.Top} style={{ opacity: 0 }} type="target" />
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="line-clamp-2 text-[17px] font-bold leading-6 text-[var(--ink)]">{node.label}</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted-strong)]">
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

      <div className="mt-4 min-w-0 overflow-hidden border-t border-dashed border-[var(--line-strong)] pt-3">
        {sources.length ? (
          <ul className="min-w-0 space-y-1.5 overflow-hidden">
            {visibleSources.map((source) => (
              <li
                key={source.url}
                className={cn(
                  'flex min-w-0 items-center gap-2 text-[12px] font-semibold',
                  isLearned ? 'text-[var(--success)]' : 'text-[var(--ink-soft)]',
                )}
                title={source.title}
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  {source.title}
                </span>
              </li>
            ))}
            {hiddenSourceCount ? (
              <li className="pl-3.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-strong)]">
                +{hiddenSourceCount} more
              </li>
            ) : null}
          </ul>
        ) : (
          <SkeletonLines count={2} />
        )}
      </div>
      <Handle position={Position.Bottom} style={{ opacity: 0 }} type="source" />
    </button>
  )
}
