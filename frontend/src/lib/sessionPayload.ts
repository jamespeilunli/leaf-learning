import type { GraphNode, Session } from '../types'

export function stripChatHistory(session: Session): Session {
  const nodes = Object.fromEntries(
    Object.entries(session.nodes).map(([id, node]) => [
      id,
      { ...node, chat_history: [] } satisfies GraphNode,
    ]),
  ) as Record<string, GraphNode>

  return { ...session, nodes }
}
