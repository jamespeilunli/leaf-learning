import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as api from '../lib/api'
import { streamSSE } from '../hooks/useSSE'
import { GraphCanvas } from './GraphCanvas'
import { GrayedNode } from './GrayedNode'
import { NodeChatPanel } from './NodeChatPanel'
import { Phase1OptionCard } from './Phase1OptionCard'
import { Phase1View } from './Phase1View'
import { Phase2Node } from './Phase2Node'
import { ResolutionPicker } from './ResolutionPicker'
import { StartScreen } from './StartScreen'
import { SESSION_STORAGE_KEY, useSessionStore } from '../store/useSessionStore'
import { makeNode, makePhase2Session, makeSession } from '../test/fixtures'
import { resetSessionStore } from '../test/storeTestUtils'
import type { Session } from '../types'

vi.mock('reactflow', () => ({
  default: ({ children, nodes, edges }: { children: React.ReactNode; nodes: unknown[]; edges: unknown[] }) => (
    <div data-edges={edges.length} data-nodes={nodes.length} data-testid="react-flow">
      {children}
    </div>
  ),
  Background: () => <div data-testid="background" />,
  Controls: () => <div data-testid="controls" />,
  Handle: () => <span data-testid="handle" />,
  MiniMap: () => <div data-testid="minimap" />,
  Position: { Top: 'top', Bottom: 'bottom' },
}))

vi.mock('../lib/api')
vi.mock('../hooks/useSSE', () => ({
  streamSSE: vi.fn(),
}))
vi.mock('lucide-react', async () => {
  const actual = await vi.importActual<typeof import('lucide-react')>('lucide-react')
  return {
    ...actual,
    Leaf: (props: React.SVGProps<SVGSVGElement>) => <svg data-testid="leaf-icon" {...props} />,
  }
})

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

    expect(screen.getByText('Leaf Learning')).toBeInTheDocument()
    expect(screen.getByText('Ready to learn?')).toBeInTheDocument()
    expect(screen.getByTestId('leaf-icon')).toBeInTheDocument()
    const resumeHeading = await screen.findByText('Continue a previous session')
    expect(resumeHeading).toBeInTheDocument()
    expect(
      screen.getByLabelText('Ready to learn?').compareDocumentPosition(resumeHeading),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    await user.type(screen.getByLabelText('Ready to learn?'), 'machine learning')
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

  it('Phase1View renders breadcrumbs, options, loading skeletons, and navigation actions', async () => {
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
    mockedApi.back.mockResolvedValue(makeSession())
    mockedApi.selectTopic.mockResolvedValue(makeSession({ current_phase1_node_id: 'grandchild' }))

    const { rerender } = render(<Phase1View />)

    expect(screen.getByRole('heading', { name: 'Representation Learning' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Embeddings/i }))
    expect(mockedApi.selectTopic).toHaveBeenCalledWith('session-1', 'grandchild')

    vi.clearAllMocks()
    await act(async () => {
      setStoreSession(session)
    })
    rerender(<Phase1View />)
    await user.click(screen.getByRole('button', { name: 'Machine Learning' }))
    expect(mockedApi.back).toHaveBeenCalled()

    useSessionStore.setState({ session, isLoading: true })
    render(<Phase1View />)
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
  })

  it('ResolutionPicker selects compact and modal depth choices', async () => {
    const user = userEvent.setup()
    setStoreSession(makeSession())
    mockedApi.setResolution.mockResolvedValue(makeSession({ resolution: 'technical' }))
    const onClose = vi.fn()

    render(<ResolutionPicker compact />)
    await user.click(screen.getByRole('button', { name: 'Technical' }))
    expect(mockedApi.setResolution).toHaveBeenCalledWith('session-1', 'technical')

    cleanup()
    render(<ResolutionPicker onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: /Intuitive Concepts/ }))
    expect(mockedApi.setResolution).toHaveBeenCalledWith('session-1', 'intuitive')
    expect(onClose).toHaveBeenCalled()
  })

  it('DeepDiveButton prompts for resolution or starts the roadmap when resolution exists', async () => {
    const user = userEvent.setup()
    setStoreSession(makeSession())

    const { rerender } = render(<Phase1View />)
    await user.click(screen.getByRole('button', { name: 'Deep Dive →' }))
    expect(screen.getByText('Choose your depth')).toBeInTheDocument()

    setStoreSession(makeSession({ resolution: 'technical' }))
    mockedApi.deepDive.mockResolvedValue({ session: makePhase2Session() })
    mockedStreamSSE.mockImplementation(async function* () {})
    rerender(<Phase1View />)

    await user.click(screen.getByRole('button', { name: 'Deep Dive →' }))
    expect(mockedApi.deepDive).toHaveBeenCalledWith('session-1', 'root')
    expect(mockedStreamSSE).toHaveBeenCalled()
  })

  it('Phase2Node shows resource state and dispatches learn, chat, and prune actions', async () => {
    const user = userEvent.setup()
    const session = makePhase2Session()
    setStoreSession(session)
    mockedApi.updateNodeState.mockImplementation(async () => useSessionStore.getState().session as Session)
    mockedApi.deleteNode.mockResolvedValue({ removed_node_ids: ['goal'] })

    render(<Phase2Node data={{ node: session.nodes.goal }} {...nodeProps('goal')} />)

    expect(screen.getByText('Representation Resource')).toBeInTheDocument()
    expect(screen.getByText('mixed')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mark as Learned' }))
    expect(mockedApi.updateNodeState).toHaveBeenCalledWith('session-1', 'goal', 'learned')

    await user.click(screen.getAllByRole('button')[1])
    expect(useSessionStore.getState().chatOpenNodeId).toBe('goal')
  })

  it('GrayedNode explains prerequisites, expands unknown nodes, and labels known duplicates', async () => {
    const user = userEvent.setup()
    const session = makePhase2Session()
    setStoreSession(session)
    mockedApi.explainNode.mockResolvedValue({ explain_more_text: 'Vector spaces help embeddings make sense.' })
    mockedStreamSSE.mockImplementation(async function* () {})

    const { rerender } = render(
      <GrayedNode data={{ node: session.nodes.prereq }} {...nodeProps('prereq')} />,
    )

    await user.click(screen.getByRole('button', { name: 'Explain more' }))
    await waitFor(() => expect(mockedApi.explainNode).toHaveBeenCalledWith('session-1', 'prereq'))
    rerender(
      <GrayedNode
        data={{ node: (useSessionStore.getState().session as Session).nodes.prereq }}
        {...nodeProps('prereq')}
      />,
    )
    expect(screen.getByText('Vector spaces help embeddings make sense.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: "Don't know" }))
    expect(mockedStreamSSE).toHaveBeenCalledWith('/api/session/session-1/node/prereq/expand', {})

    render(
      <GrayedNode
        data={{ node: { ...session.nodes.duplicate, explain_more_text: '__known__' } }}
        {...nodeProps('duplicate')}
      />,
    )
    expect(screen.getByText('✓ Already learned')).toBeInTheDocument()
  })

  it('GraphCanvas renders the Phase 2 graph chrome and Back control', async () => {
    const user = userEvent.setup()
    setStoreSession(makePhase2Session())
    localStorage.setItem(SESSION_STORAGE_KEY, 'session-1')

    render(<GraphCanvas />)

    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-nodes', '3')
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-edges', '1')
    expect(screen.getByText('Representation Learning')).toBeInTheDocument()

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
