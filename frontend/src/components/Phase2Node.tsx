import { useEffect, useRef } from 'react'

import { ExternalLink, MessageSquareText, Trash2 } from 'lucide-react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'

import { useSessionStore } from '../store/useSessionStore'
import type { GraphCanvasNodeData } from './GraphCanvas'

export function Phase2Node({ data }: NodeProps<GraphCanvasNodeData>) {
  const { node, reportSize } = data
  const streamingNodeIds = useSessionStore((state) => state.streamingNodeIds)
  const openChat = useSessionStore((state) => state.openChat)
  const markLearned = useSessionStore((state) => state.markLearned)
  const deleteNode = useSessionStore((state) => state.deleteNode)
  const isStreaming = streamingNodeIds.has(node.id)
  const isLearned = node.node_state === 'learned'
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const updateSize = () => reportSize(node.id, element.offsetWidth, element.offsetHeight)
    updateSize()

    const observer = new ResizeObserver(() => updateSize())
    observer.observe(element)

    return () => observer.disconnect()
  }, [node.id, reportSize, node.description, node.resource, node.explain_more_text, node.node_state, isStreaming])

  return (
    <div
      ref={containerRef}
      aria-label={node.label}
      className="min-w-[260px] max-w-[300px] rounded-[26px] border border-[var(--line)] bg-white/95 p-4 shadow-[0_24px_50px_rgba(15,23,42,0.14)] outline-none backdrop-blur transition focus:border-[var(--accent)] focus:ring-4 focus:ring-[color:rgba(191,91,44,0.16)]"
      tabIndex={0}
    >
      <Handle position={Position.Left} style={{ opacity: 0 }} type="target" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-strong)]">
            {isLearned ? 'Known topic' : 'Expanded topic'}
          </p>
          <div className="mt-1 text-[16px] font-semibold leading-6 text-[var(--ink)]">{node.label}</div>
        </div>
        <span className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold uppercase text-sky-800">
          technical
        </span>
      </div>

      {node.description ? (
        <p className="mt-3 text-[13px] leading-6 text-[var(--muted)]">{node.description}</p>
      ) : null}

      <div className="mt-4 rounded-[20px] border border-[var(--line)] bg-[var(--panel)] p-3">
        {isStreaming ? (
          <div className="space-y-2">
            <div className="h-4 animate-pulse rounded bg-white" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-white" />
            <div className="h-14 animate-pulse rounded bg-white" />
          </div>
        ) : node.resource ? (
          <>
            <a
              className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)] hover:underline"
              href={node.resource.url}
              rel="noreferrer"
              target="_blank"
            >
              {node.resource.title}
              <ExternalLink className="h-4 w-4" />
            </a>
            <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">{node.resource.description}</p>
          </>
        ) : isLearned ? (
          <>
            <p className="text-sm font-semibold text-emerald-800">This topic is already in your known set.</p>
            <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
              Leave it as a checkpoint, or open chat if you want a quick refresher.
            </p>
          </>
        ) : (
          <p className="text-[13px] leading-6 text-[var(--muted)]">
            Waiting for the resource and prerequisite breakdown to load.
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {isLearned ? (
          <span className="rounded-full bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
            ✓ Know
          </span>
        ) : (
          <button
            className="rounded-full bg-[var(--ink)] px-3 py-2 text-xs font-semibold text-[var(--paper)] transition hover:bg-[var(--accent)]"
            type="button"
            onClick={() => void markLearned(node.id)}
          >
            Know
          </button>
        )}

        <div className="flex items-center gap-2">
          <button
            className="rounded-full border border-[var(--line)] p-2 text-[var(--muted-strong)] transition hover:border-[var(--accent)] hover:text-[var(--ink)]"
            type="button"
            onClick={() => openChat(node.id)}
          >
            <MessageSquareText className="h-4 w-4" />
          </button>
          {node.parent_id ? (
            <button
              className="rounded-full border border-[var(--line)] p-2 text-[var(--muted-strong)] transition hover:border-[var(--danger)] hover:text-[var(--danger)]"
              type="button"
              onClick={() => void deleteNode(node.id)}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
      <Handle position={Position.Right} style={{ opacity: 0 }} type="source" />
    </div>
  )
}
