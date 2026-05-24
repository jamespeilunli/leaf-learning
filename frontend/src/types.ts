export type NodeState = 'expanded' | 'grayed' | 'learned'
export type Phase = '1' | '2'

export interface Resource {
  url: string
  title: string
  description: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

export interface GraphNode {
  id: string
  label: string
  description: string | null
  why_interesting: string | null
  phase: Phase
  node_state: NodeState
  sources: Resource[]
  resource: Resource | null
  parent_id: string | null
  child_ids: string[]
  depth: number
  chat_history: ChatMessage[]
  explain_more_text: string | null
}

export interface GraphEdge {
  id: string
  from: string
  to: string
  label: string | null
}

export interface Session {
  id: string
  created_at: string
  phase: Phase
  resolution: 'technical'
  root_topic: string
  selection_history: string[]
  current_phase1_node_id: string | null
  focus_node_id: string | null
  known_topics: string[]
  nodes: Record<string, GraphNode>
  edges: GraphEdge[]
}
