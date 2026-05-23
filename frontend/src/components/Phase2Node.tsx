import { useEffect, useRef } from 'react'

import { Handle, Position } from 'reactflow'
import type { NodeProps } from 'reactflow'

import type { GraphCanvasNodeData } from './GraphCanvas'

export function Phase2Node({ data }: NodeProps<GraphCanvasNodeData>) {
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
  }, [node.id, reportSize, node.label, node.node_state])

  return (
    <div
      ref={containerRef}
      aria-label={node.label}
      className="min-h-[112px] min-w-[180px] max-w-[180px] rounded-[24px] border border-[var(--line)] bg-white/95 p-4 shadow-[0_24px_50px_rgba(15,23,42,0.14)] outline-none backdrop-blur transition hover:border-[var(--accent)] focus:border-[var(--accent)] focus:ring-4 focus:ring-[color:rgba(191,91,44,0.16)]"
      tabIndex={0}
    >
      <Handle position={Position.Left} style={{ opacity: 0 }} type="target" />
      <div className="flex h-full flex-col justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--muted-strong)]">
          {node.node_state === 'learned' ? 'Known topic' : 'Expanded topic'}
        </p>
        <div className="mt-3 text-[15px] font-semibold leading-6 text-[var(--ink)]">{node.label}</div>
      </div>
      <Handle position={Position.Right} style={{ opacity: 0 }} type="source" />
    </div>
  )
}
