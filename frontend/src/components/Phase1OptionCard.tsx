import type { GraphNode } from '../types'

interface Phase1OptionCardProps {
  node: GraphNode
  onSelect: (nodeId: string) => void
}

export function Phase1OptionCard({ node, onSelect }: Phase1OptionCardProps) {
  return (
    <button
      className="rounded-[24px] border border-[var(--line)] bg-white p-5 text-left shadow-[0_18px_40px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:border-[var(--accent)]"
      type="button"
      onClick={() => onSelect(node.id)}
    >
      <div className="text-lg font-semibold text-[var(--ink)]">{node.label}</div>
      {node.why_interesting ? (
        <p className="mt-2 text-sm font-medium text-[var(--accent)]">{node.why_interesting}</p>
      ) : null}
      {node.description ? (
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{node.description}</p>
      ) : null}
    </button>
  )
}
