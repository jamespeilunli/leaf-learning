import type { GraphEdge, GraphNode, Session } from '../types'

export function makeNode(overrides: Partial<GraphNode> & Pick<GraphNode, 'id' | 'label'>): GraphNode {
  return {
    description: null,
    why_interesting: null,
    phase: '1',
    node_state: 'expanded',
    intuition_score: null,
    resource: null,
    parent_id: null,
    child_ids: [],
    depth: 0,
    chat_history: [],
    explain_more_text: null,
    ...overrides,
  }
}

export function makeSession(overrides: Partial<Session> = {}): Session {
  const root = makeNode({
    id: 'root',
    label: 'Machine Learning',
    description: 'Starting topic',
    child_ids: ['child-a', 'child-b'],
  })
  const childA = makeNode({
    id: 'child-a',
    label: 'Representation Learning',
    description: 'Learned features and latent spaces.',
    why_interesting: 'It explains embeddings.',
    parent_id: 'root',
    depth: 1,
  })
  const childB = makeNode({
    id: 'child-b',
    label: 'Optimization',
    description: 'Training dynamics.',
    why_interesting: 'It makes training less mysterious.',
    parent_id: 'root',
    depth: 1,
  })

  return {
    id: 'session-1',
    created_at: '2026-01-01T00:00:00Z',
    phase: '1',
    resolution: null,
    root_topic: 'Machine Learning',
    selection_history: [],
    current_phase1_node_id: 'root',
    focus_node_id: null,
    known_topics: [],
    nodes: {
      root,
      'child-a': childA,
      'child-b': childB,
    },
    edges: [],
    ...overrides,
  }
}

export function makePhase2Session(overrides: Partial<Session> = {}): Session {
  const goal = makeNode({
    id: 'goal',
    label: 'Representation Learning',
    description: 'How models learn useful internal features.',
    phase: '2',
    node_state: 'expanded',
    intuition_score: 0.42,
    resource: {
      url: 'https://example.com/representation',
      title: 'Representation Resource',
      description: 'A resource about embeddings and latent spaces.',
    },
    child_ids: ['prereq', 'duplicate'],
  })
  const prereq = makeNode({
    id: 'prereq',
    label: 'Vector Spaces',
    description: 'Embeddings live in vector spaces.',
    phase: '2',
    node_state: 'grayed',
    parent_id: 'goal',
    depth: 1,
  })
  const duplicate = makeNode({
    id: 'duplicate',
    label: ' vector   spaces ',
    description: 'Duplicate prerequisite.',
    phase: '2',
    node_state: 'grayed',
    parent_id: 'goal',
    depth: 1,
  })
  const edge: GraphEdge = { id: 'edge-1', from: 'goal', to: 'prereq', label: 'requires' }

  return {
    ...makeSession(),
    phase: '2',
    resolution: 'intuitive',
    current_phase1_node_id: 'goal',
    focus_node_id: 'goal',
    nodes: {
      goal,
      prereq,
      duplicate,
    },
    edges: [edge],
    ...overrides,
  }
}
