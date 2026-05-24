import { Check, Loader2, X } from 'lucide-react'
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

  return (
    <div className="group relative h-[132px] w-[236px] rounded-[8px] border border-dashed border-slate-400 bg-white/55 p-3 opacity-80 shadow-[0_10px_22px_rgba(15,23,42,0.10)] backdrop-blur transition hover:opacity-100 hover:shadow-[0_16px_34px_rgba(15,23,42,0.16)]">
      <Handle position={Position.Top} style={{ opacity: 0 }} type="target" />
      {node.explain_more_text === '__known__' ? (
        <div className="mb-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
          Learned elsewhere
        </div>
      ) : null}
      <div className="line-clamp-2 text-[14px] font-bold leading-5 text-slate-800">{node.label}</div>
      {node.description ? <p className="mt-2 line-clamp-3 text-[12px] leading-4 text-[var(--muted)]">{node.description}</p> : null}

      {node.explain_more_text === '__known__' ? null : (
        <div className="absolute -right-2 -top-2 flex scale-95 items-center gap-1 opacity-0 transition group-hover:scale-100 group-hover:opacity-100">
          <button
            aria-label={`Activate ${node.label}`}
            className="grid h-7 w-7 place-items-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 shadow-sm transition hover:bg-emerald-600 hover:text-white"
            type="button"
            onClick={() => void expandNode(node.id)}
          >
            {isExpanding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          </button>
          <button
            aria-label={`Remove ${node.label}`}
            className="grid h-7 w-7 place-items-center rounded-full border border-rose-200 bg-rose-50 text-rose-700 shadow-sm transition hover:bg-rose-600 hover:text-white"
            type="button"
            onClick={() => void deleteNode(node.id)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <Handle position={Position.Bottom} style={{ opacity: 0 }} type="source" />
    </div>
  )
}
