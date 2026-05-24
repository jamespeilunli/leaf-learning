import { create } from 'zustand'
import axios from 'axios'

import * as api from '../lib/api'
import { clearBrowserData } from '../lib/browserData'
import { streamSSE } from '../hooks/useSSE'
import type { GraphEdge, GraphNode, Resource, Session } from '../types'

export const SESSION_STORAGE_KEY = 'roadmap_session_id'

function normalizedLabel(label: string): string {
  return label.toLowerCase().trim().replace(/\s+/g, ' ')
}

function collectSubtree(session: Session, nodeId: string): Set<string> {
  const collected = new Set<string>()
  const stack = [nodeId]

  while (stack.length) {
    const currentId = stack.pop()
    if (!currentId || collected.has(currentId)) continue

    collected.add(currentId)
    const node = session.nodes[currentId]
    if (!node) continue

    for (const childId of node.child_ids) {
      stack.push(childId)
    }
  }

  return collected
}

function removeNodesFromSession(session: Session, removed: Set<string>): Session {
  const nodes = Object.fromEntries(
    Object.entries(session.nodes)
      .filter(([id]) => !removed.has(id))
      .map(([id, node]) => [
        id,
        {
          ...node,
          child_ids: node.child_ids.filter((childId) => !removed.has(childId)),
        },
      ]),
  ) as Record<string, GraphNode>

  const edges = session.edges.filter(
    (edge) => !removed.has(edge.from) && !removed.has(edge.to),
  )

  return { ...session, nodes, edges }
}

type ExpandPatch = {
  id?: string
  resource?: Resource | null
  sources?: Resource[]
  node_state?: GraphNode['node_state']
  phase?: GraphNode['phase']
  is_visible?: boolean
}

interface SessionStore {
  sessionId: string | null
  session: Session | null
  isLoading: boolean
  streamingNodeIds: Set<string>
  explainingNodeIds: Set<string>
  deletingNodeIds: Set<string>
  chatOpenNodeId: string | null
  selectedPhase2NodeId: string | null
  error: string | null
  initSession: (topic: string) => Promise<void>
  loadSession: (id: string) => Promise<void>
  selectTopic: (nodeId: string) => Promise<void>
  expandPhase1Topic: (nodeId: string) => Promise<void>
  back: () => Promise<void>
  deepDive: (nodeId: string) => Promise<void>
  expandNode: (nodeId: string) => Promise<void>
  explainNode: (nodeId: string) => Promise<void>
  markLearned: (nodeId: string) => Promise<void>
  deleteNode: (nodeId: string) => Promise<void>
  suggestPrerequisite: (nodeId: string, message: string) => Promise<void>
  restartFlow: () => Promise<boolean>
  openChat: (nodeId: string) => void
  closeChat: () => void
  openNodeDetails: (nodeId: string) => void
  closeNodeDetails: () => void
  _applyNodeAdded: (node: GraphNode) => void
  _applyNodeUpdated: (patch: ExpandPatch) => void
  _applyEdgeAdded: (edge: GraphEdge) => void
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessionId: null,
  session: null,
  isLoading: false,
  streamingNodeIds: new Set<string>(),
  explainingNodeIds: new Set<string>(),
  deletingNodeIds: new Set<string>(),
  chatOpenNodeId: null,
  selectedPhase2NodeId: null,
  error: null,

  async initSession(topic) {
    set({ isLoading: true, error: null })
    try {
      const data = await api.createSession(topic)
      localStorage.setItem(SESSION_STORAGE_KEY, data.session_id)
      set({
        sessionId: data.session_id,
        session: data.session,
        isLoading: false,
      })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to create session.',
      })
    }
  },

  async loadSession(id) {
    set({ isLoading: true, error: null })
    try {
      const session = await api.getSession(id)
      localStorage.setItem(SESSION_STORAGE_KEY, id)
      set({
        sessionId: id,
        session,
        isLoading: false,
      })
    } catch (error) {
      localStorage.removeItem(SESSION_STORAGE_KEY)
      set({
        sessionId: null,
        session: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load session.',
      })
      throw error
    }
  },

  async selectTopic(nodeId) {
    const sessionId = get().sessionId
    if (!sessionId) return

    set({ isLoading: true, error: null })
    try {
      const session = await api.selectTopic(sessionId, nodeId)
      set({ session, isLoading: false })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to select topic.',
      })
    }
  },

  async expandPhase1Topic(nodeId) {
    const sessionId = get().sessionId
    if (!sessionId) return

    set({ isLoading: true, error: null })
    try {
      const session = await api.expandPhase1Topic(sessionId, nodeId)
      set({ session, isLoading: false })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to expand topic.',
      })
    }
  },

  async back() {
    const sessionId = get().sessionId
    if (!sessionId) return

    set({ isLoading: true, error: null })
    try {
      const session = await api.back(sessionId)
      set({ session, isLoading: false })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to go back.',
      })
    }
  },

  async deepDive(nodeId) {
    const sessionId = get().sessionId
    if (!sessionId) return

    set({ isLoading: true, error: null })
    try {
      const response = await api.deepDive(sessionId, nodeId)
      set({ session: response.session, isLoading: false })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to start deep dive.',
      })
    }
  },

  async expandNode(nodeId) {
    const { sessionId, session } = get()
    if (!sessionId || !session) return

    const nextStreaming = new Set(get().streamingNodeIds)
    nextStreaming.add(nodeId)
    set({ streamingNodeIds: nextStreaming, error: null })

    set((state) => {
      if (!state.session) return state
      const node = state.session.nodes[nodeId]
      if (!node) return state
      return {
        session: {
          ...state.session,
          nodes: {
            ...state.session.nodes,
            [nodeId]: {
              ...node,
              phase: '2',
              node_state: 'expanded',
            },
          },
        },
      }
    })

    try {
      for await (const event of streamSSE(`/api/session/${sessionId}/node/${nodeId}/expand`, {})) {
        if (event.event === 'node_updated') {
          get()._applyNodeUpdated(event.data as ExpandPatch)
          continue
        }
        if (event.event === 'node_added') {
          get()._applyNodeAdded(event.data as GraphNode)
          continue
        }
        if (event.event === 'edge_added') {
          get()._applyEdgeAdded(event.data as GraphEdge)
          continue
        }
        if (event.event === 'stream_error') {
          const data = event.data as { message?: string }
          set({ error: data.message ?? 'Expand stream failed.' })
        }
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Expand stream failed.' })
    } finally {
      const current = new Set(get().streamingNodeIds)
      current.delete(nodeId)
      set({ streamingNodeIds: current })
    }
  },

  async explainNode(nodeId) {
    const { sessionId } = get()
    if (!sessionId) return

    const nextExplaining = new Set(get().explainingNodeIds)
    nextExplaining.add(nodeId)
    set({ explainingNodeIds: nextExplaining, error: null })

    try {
      const response = await api.explainNode(sessionId, nodeId)
      set((state) => {
        if (!state.session) return state
        const node = state.session.nodes[nodeId]
        if (!node) return state
        return {
          session: {
            ...state.session,
            nodes: {
              ...state.session.nodes,
              [nodeId]: {
                ...node,
                explain_more_text: response.explain_more_text,
              },
            },
          },
        }
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to explain node.' })
    } finally {
      const current = new Set(get().explainingNodeIds)
      current.delete(nodeId)
      set({ explainingNodeIds: current })
    }
  },

  async markLearned(nodeId) {
    const { sessionId, session } = get()
    if (!sessionId || !session) return

    const node = session.nodes[nodeId]
    if (!node) return
    const normalized = normalizedLabel(node.label)

    set((state) => {
      if (!state.session) return state
      const known = state.session.known_topics.includes(normalized)
        ? state.session.known_topics
        : [...state.session.known_topics, normalized]
      const nodes = Object.fromEntries(
        Object.entries(state.session.nodes).map(([id, currentNode]) => {
          if (id === nodeId) {
            return [id, { ...currentNode, node_state: 'learned' as const }]
          }
          if (
            currentNode.node_state === 'grayed' &&
            normalizedLabel(currentNode.label) === normalized &&
            currentNode.explain_more_text !== '__known__'
          ) {
            return [id, { ...currentNode, explain_more_text: '__known__' }]
          }
          return [id, currentNode]
        }),
      ) as Record<string, GraphNode>

      return { session: { ...state.session, known_topics: known, nodes } }
    })

    try {
      const updated = await api.updateNodeState(sessionId, nodeId, 'learned')
      set({ session: updated })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to mark learned.' })
    }
  },

  async deleteNode(nodeId) {
    const { sessionId, session } = get()
    if (!sessionId || !session || get().deletingNodeIds.has(nodeId)) return
    if (!session.nodes[nodeId]) return

    const locallyRemoved = collectSubtree(session, nodeId)

    const nextDeleting = new Set(get().deletingNodeIds)
    nextDeleting.add(nodeId)
    set({ deletingNodeIds: nextDeleting, error: null })

    const applyRemoval = (removed: Set<string>) => {
      set((state) => {
        if (!state.session) return state

        const streamingNodeIds = new Set(
          [...state.streamingNodeIds].filter((id) => !removed.has(id)),
        )
        const explainingNodeIds = new Set(
          [...state.explainingNodeIds].filter((id) => !removed.has(id)),
        )

        return {
          session: removeNodesFromSession(state.session, removed),
          streamingNodeIds,
          explainingNodeIds,
          chatOpenNodeId:
            state.chatOpenNodeId && removed.has(state.chatOpenNodeId)
              ? null
              : state.chatOpenNodeId,
          selectedPhase2NodeId:
            state.selectedPhase2NodeId && removed.has(state.selectedPhase2NodeId)
              ? null
              : state.selectedPhase2NodeId,
        }
      })
    }

    try {
      const response = await api.deleteNode(sessionId, nodeId)
      applyRemoval(new Set([...locallyRemoved, ...response.removed_node_ids]))
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        applyRemoval(locallyRemoved)
      } else {
        set({ error: error instanceof Error ? error.message : 'Failed to delete node.' })
      }
    } finally {
      const current = new Set(get().deletingNodeIds)
      current.delete(nodeId)
      set({ deletingNodeIds: current })
    }
  },

  async suggestPrerequisite(nodeId, message) {
    const { sessionId } = get()
    const trimmed = message.trim()
    if (!sessionId || !trimmed) return

    set({ error: null })
    try {
      const { node, edge } = await api.suggestPrerequisite(sessionId, nodeId, trimmed)
      get()._applyNodeAdded(node)
      get()._applyEdgeAdded(edge)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to add prerequisite.' })
    }
  },

  async restartFlow() {
    await api.clearSessions()
    await clearBrowserData()
    set({
      sessionId: null,
      session: null,
      isLoading: false,
      streamingNodeIds: new Set<string>(),
      explainingNodeIds: new Set<string>(),
      deletingNodeIds: new Set<string>(),
      chatOpenNodeId: null,
      selectedPhase2NodeId: null,
      error: null,
    })
    return true
  },

  openChat(nodeId) {
    set({ chatOpenNodeId: nodeId })
  },

  closeChat() {
    set({ chatOpenNodeId: null })
  },

  openNodeDetails(nodeId) {
    set({ selectedPhase2NodeId: nodeId })
  },

  closeNodeDetails() {
    set({ selectedPhase2NodeId: null })
  },

  _applyNodeAdded(node) {
    set((state) => {
      if (!state.session) return state
      const parentId = node.parent_id
      const parent = parentId ? state.session.nodes[parentId] : null
      return {
        session: {
          ...state.session,
          nodes: {
            ...state.session.nodes,
            [node.id]: node,
            ...(parentId && parent
              ? {
                  [parentId]: {
                    ...parent,
                    child_ids: parent.child_ids.includes(node.id)
                      ? parent.child_ids
                      : [...parent.child_ids, node.id],
                  },
                }
              : {}),
          },
        },
      }
    })
  },

  _applyNodeUpdated(patch) {
    set((state) => {
      if (!state.session || !patch.id) return state
      const node = state.session.nodes[patch.id]
      if (!node) return state
      return {
        session: {
          ...state.session,
          nodes: {
            ...state.session.nodes,
            [patch.id]: {
              ...node,
              phase: patch.phase ?? '2',
              node_state: patch.node_state ?? node.node_state,
              is_visible: patch.is_visible ?? node.is_visible,
              sources: patch.sources ?? (patch.resource ? [patch.resource] : node.sources),
              resource: patch.resource ?? node.resource,
            },
          },
        },
      }
    })
  },

  _applyEdgeAdded(edge) {
    set((state) => {
      if (!state.session) return state
      const exists = state.session.edges.some((current) => current.id === edge.id)
      return {
        session: {
          ...state.session,
          edges: exists ? state.session.edges : [...state.session.edges, edge],
        },
      }
    })
  },
}))
