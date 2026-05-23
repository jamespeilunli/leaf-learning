import { ExternalLink, MessageSquareText, Trash2 } from 'lucide-react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'

import { useSessionStore } from '../store/useSessionStore'
import type { GraphNode } from '../types'

export function Phase2Node({ data }: NodeProps<{ node: GraphNode }>) {
  const { node } = data
  const streamingNodeIds = useSessionStore((state) => state.streamingNodeIds)
  const openChat = useSessionStore((state) => state.openChat)
  const markLearned = useSessionStore((state) => state.markLearned)
  const deleteNode = useSessionStore((state) => state.deleteNode)
  const isStreaming = streamingNodeIds.has(node.id)

  return (
    <div className="min-w-[260px] max-w-[300px] rounded-[22px] border border-[var(--line)] bg-white p-4 shadow-[0_20px_40px_rgba(15,23,42,0.12)]">
      <Handle position={Position.Top} style={{ opacity: 0 }} type="target" />
      <div className="text-[15px] font-semibold leading-6 text-[var(--ink)]">{node.label}</div>

      {node.description ? (
        <p className="mt-3 text-[13px] leading-6 text-[var(--muted)]">{node.description}</p>
      ) : null}

      <div className="mt-4 rounded-[18px] border border-[var(--line)] bg-[var(--panel)] p-3">
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
        ) : (
          <p className="text-[13px] leading-6 text-[var(--muted)]">Waiting for the resource and prerequisites to load.</p>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        {node.node_state === 'learned' ? (
          <span className="text-sm font-semibold text-emerald-700">✓ Learned</span>
        ) : (
          <button
            className="rounded-full bg-[var(--ink)] px-3 py-2 text-xs font-semibold text-[var(--paper)] transition hover:bg-[var(--accent)]"
            type="button"
            onClick={() => void markLearned(node.id)}
          >
            Mark as Learned
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
      <Handle position={Position.Bottom} style={{ opacity: 0 }} type="source" />
    </div>
  )
}
