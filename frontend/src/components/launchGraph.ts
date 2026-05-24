export type LaunchGraphNode = {
  id: string
  x: number
  y: number
  size: number
  parentId: string | null
  delayMs: number
}

export type LaunchGraphLink = {
  id: string
  source: string
  target: string
}

const DEFAULT_NODE_COUNT = 162

function seededValue(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

export function buildLaunchGraph(nodeCount = DEFAULT_NODE_COUNT): LaunchGraphNode[] {
  return Array.from({ length: nodeCount }, (_, index) => {
    const ring = Math.floor(index / 9)
    const angle = seededValue(index + 1) * Math.PI * 2 + ring * 0.3
    const radius = 6 + ring * 5.2 + seededValue(index + 11) * 2.4
    const x = 50 + Math.cos(angle) * radius
    const y = 50 + Math.sin(angle) * radius

    return {
      id: `launch-node-${index}`,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      size: Number((5.8 + seededValue(index + 21) * 1.2).toFixed(2)),
      parentId: index === 0 ? null : `launch-node-${Math.max(0, index - 1 - (index % 3 === 0 ? 2 : 0))}`,
      delayMs: index * 90,
    }
  })
}

export function buildLaunchGraphLinks(nodes: LaunchGraphNode[]): LaunchGraphLink[] {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const links = new Map<string, LaunchGraphLink>()

  for (const node of nodes) {
    if (!node.parentId || !nodeIds.has(node.parentId)) continue
    const id = `${node.parentId}:${node.id}`
    links.set(id, { id, source: node.parentId, target: node.id })
  }

  for (let index = 3; index < nodes.length; index += 1) {
    const node = nodes[index]
    const extraConnectionCount = seededValue(index + 101) > 0.58 ? 2 : 1

    for (let offset = 0; offset < extraConnectionCount; offset += 1) {
      const previousIndex = Math.max(
        0,
        Math.floor(seededValue(index * 17 + offset * 13) * Math.max(1, index - 1)),
      )
      const target = nodes[previousIndex]
      if (!target || target.id === node.id || target.id === node.parentId) continue

      const pair = [node.id, target.id].sort()
      const id = `${pair[0]}:${pair[1]}`
      if (!links.has(id)) {
        links.set(id, { id, source: pair[0], target: pair[1] })
      }
    }
  }

  return [...links.values()]
}
