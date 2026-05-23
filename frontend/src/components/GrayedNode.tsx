import { useEffect, useRef } from 'react'

import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'

import type { GraphCanvasNodeData } from './GraphCanvas'

export function GrayedNode({ data }: NodeProps<GraphCanvasNodeData>) {
  const { node, reportSize } = data
  const containerRef = useRef<HTMLDivElement | null>(null)

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
      className="min-h-[112px] min-w-[168px] max-w-[168px] rounded-[24px] border border-dashed border-[var(--line)] bg-white/84 p-4 shadow-[0_18px_34px_rgba(15,23,42,0.08)] outline-none backdrop-blur transition hover:border-[var(--accent)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[color:rgba(191,91,44,0.16)]"
      tabIndex={0}
    >
      <Handle position={Position.Left} style={{ opacity: 0 }} type="target" />
      <div className="flex h-full flex-col justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-strong)]">
          {node.explain_more_text === '__known__' ? 'Known' : 'Prerequisite'}
        </p>
        <div className="mt-3 text-[15px] font-semibold leading-6 text-[var(--ink)]">{node.label}</div>
      </div>
      <Handle position={Position.Right} style={{ opacity: 0 }} type="source" />
    </div>
  )
}
