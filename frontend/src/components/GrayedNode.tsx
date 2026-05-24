import { Loader2, X } from 'lucide-react'
import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'

import { useSessionStore } from '../store/useSessionStore'
import type { GraphNode } from '../types'

export function GrayedNode({ data }: NodeProps<{ node: GraphNode }>) {
  const { node } = data
  const expandNode = useSessionStore((state) => state.expandNode)
  const deleteNode = useSessionStore((state) => state.deleteNode)
  const streamingNodeIds = useSessionStore((state) => state.streamingNodeIds)
  const isExpanding = streamingNodeIds.has(node.id)
  const isKnownElsewhere = node.explain_more_text === '__known__'
  const isDisabled = isKnownElsewhere || isExpanding

  const activateNode = () => {
    if (!isDisabled) {
      void expandNode(node.id)
    }
  }

  return (
    <div
      aria-label={`Activate ${node.label}`}
      aria-disabled={isDisabled}
      className="group relative h-[132px] w-[236px] cursor-pointer rounded-[var(--radius-sm)] border border-dashed border-[var(--line-strong)] bg-white/62 p-3 text-left opacity-85 shadow-[0_10px_22px_rgba(15,23,42,0.10)] backdrop-blur transition hover:border-[var(--accent)] hover:bg-white/76 hover:opacity-100 hover:shadow-[0_16px_34px_rgba(15,23,42,0.16)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 aria-disabled:cursor-default"
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          activateNode()
        }
      }}
      onPointerDown={(event) => {
        event.stopPropagation()
        if (event.button !== 0) return
        event.currentTarget.focus()
        activateNode()
      }}
    >
      <Handle position={Position.Top} style={{ opacity: 0 }} type="target" />
      {isKnownElsewhere ? (
        <div className="mb-2 inline-flex rounded-full border border-[var(--success)]/20 bg-[var(--success-soft)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--success)]">
          Learned elsewhere
        </div>
      ) : null}
      <div className="line-clamp-2 text-[14px] font-bold leading-5 text-[var(--ink)]">{node.label}</div>
      {node.description ? <p className="mt-2 line-clamp-3 text-[12px] leading-4 text-[var(--muted)]">{node.description}</p> : null}

      {isExpanding ? (
        <div className="absolute bottom-3 right-3 text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
        </div>
      ) : null}

      {isKnownElsewhere ? null : (
        <div className="absolute -right-2 -top-2 flex scale-95 items-center gap-1 opacity-0 transition group-focus-within:scale-100 group-focus-within:opacity-100 group-hover:scale-100 group-hover:opacity-100">
          <button
            aria-label={`Remove ${node.label}`}
            className="grid h-7 w-7 place-items-center rounded-full border border-rose-200 bg-rose-50 text-rose-700 shadow-sm transition hover:bg-rose-600 hover:text-white"
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              void deleteNode(node.id)
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <Handle position={Position.Bottom} style={{ opacity: 0 }} type="source" />
    </div>
  )
}
