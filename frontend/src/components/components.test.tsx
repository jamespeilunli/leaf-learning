import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { forwardRef, useImperativeHandle } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import { streamSSE } from '../hooks/useSSE'
import { GraphCanvas } from './GraphCanvas'
import { GrayedNode } from './GrayedNode'
import { NodeChatPanel } from './NodeChatPanel'
import { Phase1OptionCard } from './Phase1OptionCard'
import { Phase1View } from './Phase1View'
import { Phase2Node } from './Phase2Node'
import { StartScreen } from './StartScreen'
import { SESSION_STORAGE_KEY, useSessionStore } from '../store/useSessionStore'
import { makeNode, makePhase2Session, makeSession } from '../test/fixtures'
import { resetSessionStore } from '../test/storeTestUtils'
import type { Session } from '../types'

vi.mock('reactflow', () => ({
  default: ({
    children,
    nodes,
    edges,
    nodeTypes = {},
  }: {
    children: ReactNode
    nodes: Array<{ id: string; type?: string; data: unknown }>
    edges: unknown[]
    nodeTypes?: Record<string, ComponentType<Record<string, unknown>>>
  }) => (
    <div data-edges={edges.length} data-nodes={nodes.length} data-testid="react-flow">
      {nodes.map((node) => {
        const NodeComponent = node.type ? nodeTypes[node.type] : null
        return NodeComponent ? (
          <NodeComponent key={node.id} data={node.data} {...nodeProps(node.id)} />
        ) : null
      })}
      {children}
    </div>
  ),
  Background: () => <div data-testid="background" />,
  Controls: () => <div data-testid="controls" />,
  Handle: () => <span data-testid="handle" />,
  MarkerType: { ArrowClosed: 'arrowclosed' },
  MiniMap: () => <div data-testid="minimap" />,
  Position: { Top: 'top', Bottom: 'bottom' },
  getNodesBounds: vi.fn(() => ({ x: 0, y: 0, width: 100, height: 100 })),
  getViewportForBounds: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
  useReactFlow: () => ({
    getViewport: vi.fn(() => ({ x: 0, y: 0, zoom: 1 })),
    setViewport: vi.fn(),
  }),
}))

vi.mock('react-force-graph-2d', () => ({
  default: forwardRef(
    (
      {
        graphData,
        onNodeClick,
      }: {
        graphData: { nodes: Array<{ id: string; label: string }> }
        onNodeClick?: (node: { id: string; label: string }) => void
      },
      ref,
    ) => {
      useImperativeHandle(ref, () => ({
        centerAt: vi.fn(),
        d3Force: vi.fn(() => ({ distance: vi.fn(), strength: vi.fn() })),
        d3ReheatSimulation: vi.fn(),
        refresh: vi.fn(),
        zoom: vi.fn(),
        zoomToFit: vi.fn(),
      }))

      return (
        <div data-testid="force-graph">
          {graphData.nodes.map((node) => (
            <button key={node.id} type="button" onClick={() => onNodeClick?.(node)}>
              {node.label}
            </button>
          ))}
        </div>
      )
    },
  ),
}))

vi.mock('../lib/api')
vi.mock('../hooks/useSSE', () => ({
  streamSSE: vi.fn(),
}))

const mockedApi = vi.mocked(api)
const mockedStreamSSE = vi.mocked(streamSSE)

function setStoreSession(session: Session, sessionId = 'session-1') {
  useSessionStore.setState({ sessionId, session })
}

function nodeProps(id: string) {
  return {
    id,
    selected: false,
    type: 'test',
    zIndex: 0,
    isConnectable: true,
    xPos: 0,
    yPos: 0,
    dragHandle: undefined,
    dragging: false,
  }
}

describe('frontend components', () => {
  beforeEach(() => {
    resetSessionStore()
    vi.clearAllMocks()
  })

  it('StartScreen creates a new session and resumes previous sessions', async () => {
    const user = userEvent.setup()
    mockedApi.listSessions.mockResolvedValue([
      { id: 'old-session', root_topic: 'Distributed Systems', created_at: '2026-01-01T00:00:00Z', phase: '2' },
    ])
    mockedApi.createSession.mockResolvedValue({ session_id: 'new-session', session: makeSession() })
    mockedApi.getSession.mockResolvedValue(makePhase2Session())

    render(<StartScreen />)

    expect(await screen.findByText('Continue a previous session')).toBeInTheDocument()
    await user.type(screen.getByLabelText('What do you want to learn?'), 'machine learning')
    await user.click(screen.getByRole('button', { name: 'Start exploring' }))

    expect(mockedApi.createSession).toHaveBeenCalledWith('machine learning')
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe('new-session')

    await user.click(screen.getByRole('button', { name: /Distributed Systems/i }))
    expect(mockedApi.getSession).toHaveBeenCalledWith('old-session')
  })

  it('Phase1OptionCard displays subtopic context and selects the node', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const node = makeNode({
      id: 'child-a',
      label: 'Representation Learning',
      description: 'Two sentence description.',
      why_interesting: 'It explains embeddings.',
    })

    render(<Phase1OptionCard node={node} onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: /Representation Learning/i }))

    expect(screen.getByText('It explains embeddings.')).toBeInTheDocument()
    expect(onSelect).toHaveBeenCalledWith('child-a')
  })

  it('Phase1View renders graph topics, node details, and expansion actions', async () => {
    const user = userEvent.setup()
    const session = makeSession({
      selection_history: ['root'],
      current_phase1_node_id: 'child-a',
    })
    session.nodes['child-a'].child_ids = ['grandchild']
    session.nodes.grandchild = makeNode({
      id: 'grandchild',
      label: 'Embeddings',
      parent_id: 'child-a',
      depth: 2,
    })
    setStoreSession(session)
    mockedApi.expandPhase1Topic.mockResolvedValue(makeSession())

    render(<Phase1View />)

    await user.click(screen.getByRole('button', { name: /Representation Learning/i }))
    expect(screen.getByRole('heading', { name: 'Representation Learning' })).toBeInTheDocument()

    vi.clearAllMocks()
    await user.click(screen.getByRole('button', { name: /Optimization/i }))
    await user.click(screen.getByRole('button', { name: 'Expand' }))
    expect(mockedApi.expandPhase1Topic).toHaveBeenCalledWith('session-1', 'child-b')
  })

  it('DeepDiveButton starts the roadmap from the selected node', async () => {
    const user = userEvent.setup()
    setStoreSession(makeSession())
    mockedApi.deepDive.mockResolvedValue({ session: makePhase2Session() })
    mockedStreamSSE.mockImplementation(async function* () {})

    render(<Phase1View />)

    await user.click(screen.getByRole('button', { name: 'Machine Learning' }))
    await user.click(screen.getByRole('button', { name: 'Deep Dive →' }))
    expect(mockedApi.deepDive).toHaveBeenCalledWith('session-1', 'root')
    expect(mockedStreamSSE).toHaveBeenCalled()
  })

  it('Phase2Node shows resource state and opens the node details sidebar', async () => {
    const user = userEvent.setup()
    const session = makePhase2Session()
    setStoreSession(session)

    render(<Phase2Node data={{ node: session.nodes.goal }} {...nodeProps('goal')} />)

    expect(screen.getByText('Representation Resource')).toBeInTheDocument()
    expect(screen.getByText('Active module')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Representation Learning/i }))
    expect(useSessionStore.getState().selectedPhase2NodeId).toBe('goal')
  })

  it('GrayedNode activates, removes, and labels known duplicates', async () => {
    const user = userEvent.setup()
    const session = makePhase2Session()
    setStoreSession(session)
    mockedStreamSSE.mockImplementation(async function* () {})
    mockedApi.deleteNode.mockResolvedValue({ removed_node_ids: ['prereq'] })

    render(
      <GrayedNode data={{ node: session.nodes.prereq }} {...nodeProps('prereq')} />,
    )

    await user.click(screen.getByRole('button', { name: 'Activate Vector Spaces' }))
    expect(mockedStreamSSE).toHaveBeenCalledWith('/api/session/session-1/node/prereq/expand', {})

    await user.click(screen.getByRole('button', { name: 'Remove Vector Spaces' }))
    expect(mockedApi.deleteNode).toHaveBeenCalledWith('session-1', 'prereq')

    render(
      <GrayedNode
        data={{ node: { ...session.nodes.duplicate, explain_more_text: '__known__' } }}
        {...nodeProps('duplicate')}
      />,
    )
    expect(screen.getByText('Learned elsewhere')).toBeInTheDocument()
  })

  it('GraphCanvas renders the Phase 2 graph chrome and Back control', async () => {
    const user = userEvent.setup()
    setStoreSession(makePhase2Session())
    localStorage.setItem(SESSION_STORAGE_KEY, 'session-1')

    render(<GraphCanvas />)

    await waitFor(() => expect(screen.getByTestId('react-flow')).toHaveAttribute('data-nodes', '3'))
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-edges', '1')
    expect(screen.getAllByText('Representation Learning').length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Back to start' }))
    expect(useSessionStore.getState().session).toBeNull()
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
  })

  it('NodeChatPanel streams a scoped answer and reloads persisted history', async () => {
    const user = userEvent.setup()
    const session = makePhase2Session()
    setStoreSession(session)
    useSessionStore.setState({ chatOpenNodeId: 'goal' })
    mockedApi.getSession.mockResolvedValue(session)
    mockedStreamSSE.mockImplementation(async function* () {
      yield { event: 'token', data: { text: 'Hello ' } }
      yield { event: 'token', data: { text: 'there' } }
      yield { event: 'stream_done', data: {} }
    })

    render(<NodeChatPanel />)

    await user.type(screen.getByPlaceholderText('Ask about this node...'), 'What is this?')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText('Hello there')).toBeInTheDocument()
    expect(mockedStreamSSE).toHaveBeenCalledWith('/api/session/session-1/node/goal/chat', {
      message: 'What is this?',
    })
    await waitFor(() => expect(mockedApi.getSession).toHaveBeenCalledWith('session-1'))

    await user.click(within(screen.getByRole('banner')).getByRole('button'))
    expect(useSessionStore.getState().chatOpenNodeId).toBeNull()
  })
})
