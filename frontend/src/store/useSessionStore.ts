import { create } from 'zustand'

import * as api from '../lib/api'
import { clearBrowserData } from '../lib/browserData'
import { streamSSE } from '../hooks/useSSE'
import type { GraphEdge, GraphNode, Resource, Session } from '../types'
import { loadLocalSession, saveLocalSession } from '../lib/sessionPersistence'
import { stripChatHistory } from '../lib/sessionPayload'

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

function appendChildrenToSession(session: Session, nodeId: string, children: GraphNode[]): Session {
  if (!children.length) return session
  const parent = session.nodes[nodeId]
  if (!parent) return session

  const nodes = { ...session.nodes }
  const childIds = [...parent.child_ids]
  for (const child of children) {
    nodes[child.id] = child
    if (!childIds.includes(child.id)) childIds.push(child.id)
  }
  nodes[nodeId] = { ...parent, child_ids: childIds }
  return { ...session, nodes }
}

function persistSession(session: Session): Session {
  saveLocalSession(session)
  return session
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
  activeView: 'home' | 'phase1' | 'phase2'
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
  showPhase1: () => void
  returnHome: () => void
  expandNode: (nodeId: string) => Promise<void>
  explainNode: (nodeId: string) => Promise<void>
  markLearned: (nodeId: string) => Promise<void>
  deleteNode: (nodeId: string) => Promise<void>
  suggestPrerequisite: (nodeId: string, message: string) => Promise<void>
  restartFlow: () => Promise<boolean>
  openChat: (nodeId: string) => void
  closeChat: () => void
  appendChatExchange: (nodeId: string, userMessage: string, assistantMessage: string) => void
  openNodeDetails: (nodeId: string) => void
  closeNodeDetails: () => void
  _applyNodeAdded: (node: GraphNode) => void
  _applyNodeUpdated: (patch: ExpandPatch) => void
  _applyEdgeAdded: (edge: GraphEdge) => void
  _prefetchPhase2: (startNodeIds: string[]) => Promise<void>
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessionId: null,
  session: null,
  activeView: 'home',
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
      saveLocalSession(data.session)
      set({
        sessionId: data.session_id,
        session: data.session,
        activeView: data.session.phase === '2' ? 'phase2' : 'phase1',
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
      const session = loadLocalSession(id)
      if (!session) throw new Error('Saved session not found.')
      localStorage.setItem(SESSION_STORAGE_KEY, id)
      set({
        sessionId: id,
        session,
        activeView: session.phase === '2' ? 'phase2' : 'phase1',
        isLoading: false,
      })
    } catch (error) {
      localStorage.removeItem(SESSION_STORAGE_KEY)
      set({
        sessionId: null,
        session: null,
        activeView: 'home',
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load session.',
      })
      throw error
    }
  },

  async selectTopic(nodeId) {
    const session = get().session
    if (!session) return

    set({ isLoading: true, error: null })
    try {
      const currentId = session.current_phase1_node_id
      const selected = session.nodes[nodeId]
      if (!currentId || !selected) throw new Error('Topic not found.')

      let nextSession: Session = {
        ...session,
        selection_history: [...session.selection_history, currentId],
        current_phase1_node_id: nodeId,
      }

      if (!selected.child_ids.length) {
        const response = await api.generatePhase1Children(nextSession, nodeId)
        nextSession = appendChildrenToSession(nextSession, nodeId, response.children)
      }

      nextSession = persistSession(nextSession)
      set({ session: nextSession, activeView: 'phase1', isLoading: false })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to select topic.',
      })
    }
  },

  async expandPhase1Topic(nodeId) {
    const session = get().session
    if (!session) return

    set({ isLoading: true, error: null })
    try {
      const selected = session.nodes[nodeId]
      if (!selected) throw new Error('Topic not found.')

      let nextSession = session
      if (!selected.child_ids.length) {
        const response = await api.generatePhase1Children(session, nodeId)
        nextSession = persistSession(appendChildrenToSession(session, nodeId, response.children))
      }

      set({ session: nextSession, activeView: 'phase1', isLoading: false })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to expand topic.',
      })
    }
  },

  async back() {
    const session = get().session
    if (!session) return

    set({ isLoading: true, error: null })
    try {
      if (!session.selection_history.length) throw new Error('Already at root.')
      const nextHistory = session.selection_history.slice(0, -1)
      const nextSession = persistSession({
        ...session,
        selection_history: nextHistory,
        current_phase1_node_id: session.selection_history[session.selection_history.length - 1],
      })
      set({ session: nextSession, activeView: 'phase1', isLoading: false })
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to go back.',
      })
    }
  },

  async deepDive(nodeId) {
    const session = get().session
    if (!session) return

    set({ isLoading: true, error: null })
    try {
      const node = session.nodes[nodeId]
      if (!node) throw new Error('Topic not found.')
      const nextSession = persistSession({
        ...session,
        phase: '2',
        focus_node_id: nodeId,
        nodes: {
          ...session.nodes,
          [nodeId]: {
            ...node,
            phase: '2',
            node_state: 'expanded',
            is_visible: true,
            child_ids: node.child_ids.filter(
              (childId) => session.nodes[childId]?.phase === '2',
            ),
          },
        },
      })
      set({ session: nextSession, activeView: 'phase2', isLoading: false })
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

    const requestSession = session
    const nextStreaming = new Set(get().streamingNodeIds)
    nextStreaming.add(nodeId)
    set({ streamingNodeIds: nextStreaming, error: null })

    set((state) => {
      if (!state.session) return state
      const node = state.session.nodes[nodeId]
      if (!node) return state
      const nextSession = persistSession({
        ...state.session,
        nodes: {
          ...state.session.nodes,
          [nodeId]: {
            ...node,
            phase: '2',
            node_state: 'expanded',
          },
        },
      })
      return {
        session: nextSession,
      }
    })

    const prefetchStartIds: string[] = []
    try {
      for await (const event of streamSSE(`/api/session/${sessionId}/node/${nodeId}/expand`, {
        session: stripChatHistory(requestSession),
      })) {
        if (event.event === 'node_updated') {
          get()._applyNodeUpdated(event.data as ExpandPatch)
          continue
        }
        if (event.event === 'node_added') {
          const node = event.data as GraphNode
          get()._applyNodeAdded(node)
          prefetchStartIds.push(node.id)
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
      if (prefetchStartIds.length) {
        void get()._prefetchPhase2(prefetchStartIds)
      }
    }
  },

  showPhase1() {
    set({
      activeView: 'phase1',
      selectedPhase2NodeId: null,
      chatOpenNodeId: null,
      error: null,
    })
  },

  returnHome() {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    set({
      sessionId: null,
      session: null,
      activeView: 'home',
      isLoading: false,
      streamingNodeIds: new Set<string>(),
      explainingNodeIds: new Set<string>(),
      deletingNodeIds: new Set<string>(),
      chatOpenNodeId: null,
      selectedPhase2NodeId: null,
      error: null,
    })
  },

  async explainNode(nodeId) {
    const { sessionId, session } = get()
    if (!sessionId || !session) return

    const nextExplaining = new Set(get().explainingNodeIds)
    nextExplaining.add(nodeId)
    set({ explainingNodeIds: nextExplaining, error: null })

    try {
      const response = await api.explainNode(sessionId, nodeId, session)
      set((state) => {
        if (!state.session) return state
        const node = state.session.nodes[nodeId]
        if (!node) return state
        const nextSession = persistSession({
          ...state.session,
          nodes: {
            ...state.session.nodes,
            [nodeId]: {
              ...node,
              explain_more_text: response.explain_more_text,
            },
          },
        })
        return {
          session: nextSession,
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
    const { session } = get()
    if (!session) return

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

      return { session: persistSession({ ...state.session, known_topics: known, nodes }) }
    })
  },

  async deleteNode(nodeId) {
    const { session } = get()
    if (!session || get().deletingNodeIds.has(nodeId)) return
    if (!session.nodes[nodeId]) return

    const locallyRemoved = collectSubtree(session, nodeId)

    const nextDeleting = new Set(get().deletingNodeIds)
    nextDeleting.add(nodeId)
    set({ deletingNodeIds: nextDeleting, error: null })

    set((state) => {
      if (!state.session) return state

      const streamingNodeIds = new Set(
        [...state.streamingNodeIds].filter((id) => !locallyRemoved.has(id)),
      )
      const explainingNodeIds = new Set(
        [...state.explainingNodeIds].filter((id) => !locallyRemoved.has(id)),
      )

      return {
        session: persistSession(removeNodesFromSession(state.session, locallyRemoved)),
        streamingNodeIds,
        explainingNodeIds,
        chatOpenNodeId:
          state.chatOpenNodeId && locallyRemoved.has(state.chatOpenNodeId)
            ? null
            : state.chatOpenNodeId,
        selectedPhase2NodeId:
          state.selectedPhase2NodeId && locallyRemoved.has(state.selectedPhase2NodeId)
            ? null
            : state.selectedPhase2NodeId,
      }
    })

    const current = new Set(get().deletingNodeIds)
    current.delete(nodeId)
    set({ deletingNodeIds: current })
  },

  async suggestPrerequisite(nodeId, message) {
    const { sessionId, session } = get()
    const trimmed = message.trim()
    if (!sessionId || !session || !trimmed) return

    set({ error: null })
    try {
      const { node, edge } = await api.suggestPrerequisite(sessionId, nodeId, trimmed, session)
      get()._applyNodeAdded(node)
      get()._applyEdgeAdded(edge)
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to add prerequisite.' })
    }
  },

  async restartFlow() {
    await clearBrowserData()
    set({
      sessionId: null,
      session: null,
      activeView: 'home',
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

  appendChatExchange(nodeId, userMessage, assistantMessage) {
    set((state) => {
      if (!state.session) return state
      const node = state.session.nodes[nodeId]
      if (!node) return state
      const nextHistory = [
        ...node.chat_history,
        { role: 'user' as const, content: userMessage, created_at: new Date().toISOString() },
        { role: 'assistant' as const, content: assistantMessage, created_at: new Date().toISOString() },
      ].slice(-20)
      const nextSession = persistSession({
        ...state.session,
        nodes: {
          ...state.session.nodes,
          [nodeId]: {
            ...node,
            chat_history: nextHistory,
          },
        },
      })
      return { session: nextSession }
    })
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
      const nextSession = persistSession({
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
      })
      return {
        session: nextSession,
      }
    })
  },

  _applyNodeUpdated(patch) {
    set((state) => {
      if (!state.session || !patch.id) return state
      const node = state.session.nodes[patch.id]
      if (!node) return state
      const nextSession = persistSession({
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
      })
      return {
        session: nextSession,
      }
    })
  },

  _applyEdgeAdded(edge) {
    set((state) => {
      if (!state.session) return state
      const exists = state.session.edges.some((current) => current.id === edge.id)
      const nextSession = persistSession({
        ...state.session,
        edges: exists ? state.session.edges : [...state.session.edges, edge],
      })
      return {
        session: nextSession,
      }
    })
  },

  async _prefetchPhase2(startNodeIds) {
    const { sessionId, session } = get()
    if (!sessionId || !session || !startNodeIds.length) return

    try {
      const response = await api.prefetchPhase2(sessionId, session, startNodeIds)
      if (!response || (!response.nodes.length && !response.edges.length)) return
      set((state) => {
        if (!state.session || state.session.id !== session.id) return state

        const nodes = { ...state.session.nodes }
        for (const node of response.nodes) {
          nodes[node.id] = node
          if (node.parent_id && nodes[node.parent_id]) {
            const parent = nodes[node.parent_id]
            nodes[node.parent_id] = {
              ...parent,
              child_ids: parent.child_ids.includes(node.id)
                ? parent.child_ids
                : [...parent.child_ids, node.id],
            }
          }
        }

        const existingEdges = new Set(state.session.edges.map((edge) => edge.id))
        const edges = [
          ...state.session.edges,
          ...response.edges.filter((edge) => !existingEdges.has(edge.id)),
        ]
        return { session: persistSession({ ...state.session, nodes, edges }) }
      })
    } catch {
      return
    }
  },
}))
