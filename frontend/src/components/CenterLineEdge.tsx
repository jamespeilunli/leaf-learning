import { BaseEdge } from 'reactflow'
import type { EdgeProps } from 'reactflow'

export function CenterLineEdge({
  id,
  data,
  markerEnd,
  style,
}: EdgeProps<{ sourceCenter?: { x: number; y: number }; targetCenter?: { x: number; y: number } }>) {
  const sourceCenter = data?.sourceCenter
  const targetCenter = data?.targetCenter

  if (!sourceCenter || !targetCenter) {
    return null
  }

  const path = `M ${sourceCenter.x} ${sourceCenter.y} L ${targetCenter.x} ${targetCenter.y}`
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
}
