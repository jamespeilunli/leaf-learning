import { beforeEach, describe, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'

import * as api from '../lib/api'
import { streamSSE } from '../hooks/useSSE'
import { SESSION_STORAGE_KEY, useSessionStore } from './useSessionStore'
import { makeNode, makePhase2Session, makeSession } from '../test/fixtures'
import { resetSessionStore } from '../test/storeTestUtils'
import type { GraphEdge, Session } from '../types'

vi.mock('../lib/api')
vi.mock('../hooks/useSSE', () => ({
  streamSSE: vi.fn(),
}))

const mockedApi = vi.mocked(api)
const mockedStreamSSE = vi.mocked(streamSSE)

function getState() {
  return useSessionStore.getState()
}

describe('useSessionStore', () => {
  beforeEach(() => {
    resetSessionStore()
    vi.clearAllMocks()
  })

  it('creates and persists a new session id', async () => {
    const session = makeSession()
    mockedApi.createSession.mockResolvedValue({ session_id: 'session-1', session })

    await getState().initSession('machine learning')

    expect(mockedApi.createSession).toHaveBeenCalledWith('machine learning')
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe('session-1')
    expect(getState().session).toBe(session)
    expect(getState().isLoading).toBe(false)
  })

  it('loads sessions and clears stale ids on failure', async () => {
    const session = makeSession()
    mockedApi.getSession.mockResolvedValueOnce(session)

    await getState().loadSession('session-1')

    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe('session-1')
    expect(getState().sessionId).toBe('session-1')

    mockedApi.getSession.mockRejectedValueOnce(new Error('missing'))
    await expect(getState().loadSession('missing')).rejects.toThrow('missing')
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    expect(getState().session).toBeNull()
  })

  it('runs phase 1 navigation and expansion mutations through the API', async () => {
    useSessionStore.setState({ sessionId: 'session-1', session: makeSession() })
    const selected = makeSession({ current_phase1_node_id: 'child-a', selection_history: ['root'] })
    const expanded = makeSession({
      nodes: {
        ...makeSession().nodes,
        'child-a': makeNode({
          id: 'child-a',
          label: 'Representation Learning',
          child_ids: ['grandchild'],
        }),
      },
    })
    const backed = makeSession()
    mockedApi.selectTopic.mockResolvedValue(selected)
    mockedApi.expandPhase1Topic.mockResolvedValue(expanded)
    mockedApi.back.mockResolvedValue(backed)

    await getState().selectTopic('child-a')
    expect(getState().session).toBe(selected)

    await getState().expandPhase1Topic('child-a')
    expect(mockedApi.expandPhase1Topic).toHaveBeenCalledWith('session-1', 'child-a')
    expect(getState().session).toBe(expanded)

    await getState().back()
    expect(getState().session).toBe(backed)
  })

  it('starts deep dive and expands the focus node', async () => {
    useSessionStore.setState({ sessionId: 'session-1', session: makeSession() })
    const phase2 = makePhase2Session()
    mockedApi.deepDive.mockResolvedValue({ session: phase2 })
    mockedStreamSSE.mockImplementation(async function* () {})

    await getState().deepDive('goal')
    await getState().expandNode('goal')

    expect(mockedApi.deepDive).toHaveBeenCalledWith('session-1', 'goal')
    expect(mockedStreamSSE).toHaveBeenCalledWith('/api/session/session-1/node/goal/expand', {})
    expect(getState().streamingNodeIds.size).toBe(0)
  })

  it('applies streamed phase 2 node updates, child additions, and edges', async () => {
    const session = makePhase2Session({
      nodes: {
        goal: makeNode({
          id: 'goal',
          label: 'Representation Learning',
          phase: '2',
          node_state: 'grayed',
          child_ids: [],
        }),
      },
      edges: [],
    })
    const child = makeNode({
      id: 'vector',
      label: 'Vector Spaces',
      phase: '2',
      node_state: 'grayed',
      parent_id: 'goal',
    })
    const edge: GraphEdge = { id: 'edge-vector', from: 'goal', to: 'vector', label: 'requires' }
    useSessionStore.setState({ sessionId: 'session-1', session })
    mockedStreamSSE.mockImplementation(async function* () {
      yield {
        event: 'node_updated',
        data: {
          id: 'goal',
          resource: {
            url: 'https://example.com',
            title: 'Resource',
            description: 'Resource description.',
          },
          sources: [
            {
              url: 'https://example.com/advanced',
              title: 'Advanced Resource',
              description: 'Advanced description.',
            },
          ],
        },
      }
      yield { event: 'node_added', data: child }
      yield { event: 'edge_added', data: edge }
    })

    await getState().expandNode('goal')

    const updated = getState().session as Session
    expect(updated.nodes.goal.node_state).toBe('expanded')
    expect(updated.nodes.goal.resource?.title).toBe('Resource')
    expect(updated.nodes.goal.sources).toHaveLength(1)
    expect(updated.nodes.goal.sources[0].title).toBe('Advanced Resource')
    expect(updated.nodes.goal.child_ids).toContain('vector')
    expect(updated.edges).toContainEqual(edge)
  })

  it('shows streamed child nodes before expansion completes', async () => {
    const session = makePhase2Session({
      nodes: {
        goal: makeNode({
          id: 'goal',
          label: 'Representation Learning',
          phase: '2',
          node_state: 'grayed',
          child_ids: [],
        }),
      },
      edges: [],
    })
    const child = makeNode({
      id: 'vector',
      label: 'Vector Spaces',
      phase: '2',
      node_state: 'grayed',
      parent_id: 'goal',
    })
    let finishStream!: () => void
    const streamCanFinish = new Promise<void>((resolve) => {
      finishStream = resolve
    })
    useSessionStore.setState({ sessionId: 'session-1', session })
    mockedStreamSSE.mockImplementation(async function* () {
      yield { event: 'node_added', data: child }
      await streamCanFinish
      yield { event: 'stream_done', data: {} }
    })

    const expand = getState().expandNode('goal')
    await waitFor(() => {
      expect((getState().session as Session).nodes.vector).toEqual(child)
    })

    const duringStream = getState().session as Session
    expect(duringStream.nodes.goal.child_ids).toContain('vector')
    expect(getState().streamingNodeIds.has('goal')).toBe(true)

    finishStream()
    await expand

    expect(getState().streamingNodeIds.has('goal')).toBe(false)
  })

  it('explains grayed nodes, marks learned duplicates, and prunes subtrees', async () => {
    const session = makePhase2Session()
    useSessionStore.setState({ sessionId: 'session-1', session })
    mockedApi.explainNode.mockResolvedValue({ explain_more_text: 'Vector spaces explanation.' })
    mockedApi.updateNodeState.mockImplementation(async () => useSessionStore.getState().session as Session)
    mockedApi.deleteNode.mockResolvedValue({ removed_node_ids: ['prereq'] })

    await getState().explainNode('prereq')
    expect((getState().session as Session).nodes.prereq.explain_more_text).toBe('Vector spaces explanation.')

    await getState().markLearned('prereq')
    const learned = getState().session as Session
    expect(learned.known_topics).toContain('vector spaces')
    expect(learned.nodes.prereq.node_state).toBe('learned')
    expect(learned.nodes.duplicate.explain_more_text).toBe('__known__')

    await getState().deleteNode('prereq')
    const pruned = getState().session as Session
    expect(pruned.nodes.prereq).toBeUndefined()
    expect(pruned.edges.some((edge) => edge.to === 'prereq')).toBe(false)
  })

  it('removes stale local subtrees when the backend already pruned them', async () => {
    const session = makePhase2Session()
    session.nodes.prereq.child_ids = ['nested']
    session.nodes.nested = makeNode({
      id: 'nested',
      label: 'Nested prerequisite',
      phase: '2',
      node_state: 'grayed',
      parent_id: 'prereq',
      depth: 2,
    })
    session.edges.push({ id: 'edge-nested', from: 'prereq', to: 'nested', label: 'requires' })
    useSessionStore.setState({
      sessionId: 'session-1',
      session,
      chatOpenNodeId: 'nested',
      selectedPhase2NodeId: 'prereq',
      streamingNodeIds: new Set(['nested']),
      explainingNodeIds: new Set(['prereq']),
    })
    mockedApi.deleteNode.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404 },
      message: 'not found',
    })

    await getState().deleteNode('prereq')

    const pruned = getState().session as Session
    expect(pruned.nodes.prereq).toBeUndefined()
    expect(pruned.nodes.nested).toBeUndefined()
    expect(pruned.nodes.goal.child_ids).not.toContain('prereq')
    expect(pruned.edges.some((edge) => edge.to === 'nested')).toBe(false)
    expect(getState().chatOpenNodeId).toBeNull()
    expect(getState().selectedPhase2NodeId).toBeNull()
    expect(getState().streamingNodeIds.has('nested')).toBe(false)
    expect(getState().explainingNodeIds.has('prereq')).toBe(false)
    expect(getState().error).toBeNull()
  })

  it('manages chat visibility and back-to-start restart state', () => {
    useSessionStore.setState({
      sessionId: 'session-1',
      session: makePhase2Session(),
      streamingNodeIds: new Set(['goal']),
      explainingNodeIds: new Set(['prereq']),
      selectedPhase2NodeId: 'goal',
    })
    localStorage.setItem(SESSION_STORAGE_KEY, 'session-1')

    getState().openChat('goal')
    expect(getState().chatOpenNodeId).toBe('goal')

    getState().closeChat()
    expect(getState().chatOpenNodeId).toBeNull()

    getState().restartFlow()
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    expect(getState().session).toBeNull()
    expect(getState().streamingNodeIds.size).toBe(0)
    expect(getState().explainingNodeIds.size).toBe(0)
    expect(getState().selectedPhase2NodeId).toBeNull()
  })

  it('stores API and stream failures as user-visible errors', async () => {
    useSessionStore.setState({ sessionId: 'session-1', session: makePhase2Session() })
    mockedApi.selectTopic.mockRejectedValue(new Error('select failed'))
    mockedStreamSSE.mockImplementation(async function* () {
      yield { event: 'stream_error', data: { message: 'expand failed' } }
    })

    await getState().selectTopic('missing')
    expect(getState().error).toBe('select failed')

    await getState().expandNode('prereq')
    expect(getState().error).toBe('expand failed')
  })
})
